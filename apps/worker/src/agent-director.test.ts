import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MockAIProvider } from "@navo/agents";
import { accounts, agentMissions, agentProfiles, createMission, db, workspaces } from "@navo/db";
import { planMission } from "@navo/workflows/mission-planner";
import { runAgentDirectorTick } from "./agent-director";

async function createDirectorFixture(options: { paused?: boolean; withAccount?: boolean } = {}) {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  await db.insert(workspaces).values({ id: workspaceId, name: "Director Test Workspace", slug: `director-test-${workspaceId}`, plan: "TEST" });
  await db.insert(agentProfiles).values({
    workspaceId,
    createdBy: userId,
    purpose: "Test autonomous root-Mission creation.",
    status: options.paused ? "PAUSED" : "RUNNING",
    directorEnabled: true,
    directorIntervalMinutes: 15,
    directorCooldownMinutes: 0,
    directorMaxActiveMissions: 1,
    directorDailyMissionLimit: 3,
  });
  if (options.withAccount !== false) {
    await db.insert(accounts).values({
      id: accountId,
      workspaceId,
      createdBy: userId,
      name: "Eligible Director Manufacturer GmbH",
      domain: `director-${accountId}.example`,
      website: `https://director-${accountId}.example`,
      country: "Germany",
      industry: "Automotive Components",
      source: "TEST",
      qualification: "NOT_RESEARCHED",
      playStatus: "NOT_STARTED",
      fitScore: 90,
    });
  }
  return { workspaceId, userId, accountId };
}

describe("agent director integration", () => {
  it("creates and queues one root Mission for eligible accounts, then does not repeat before its next tick", async () => {
    const fixture = await createDirectorFixture();
    const queued: Array<{ workspaceId: string; missionId: string }> = [];
    const now = new Date("2026-07-18T00:00:00.000Z");
    const dependencies = {
      ai: new MockAIProvider(),
      now: () => now,
      enqueueMission: async (input: { workspaceId: string; missionId: string }) => { queued.push(input); },
    };

    const created = await runAgentDirectorTick({ workspaceId: fixture.workspaceId }, dependencies);
    expect(created.kind).toBe("CREATED_AND_QUEUED");
    expect(queued).toHaveLength(1);
    const [mission] = await db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, fixture.workspaceId), eq(agentMissions.id, queued[0]!.missionId))).limit(1);
    expect(mission).toMatchObject({
      status: "RUNNING",
      inputSource: "AGENT_DIRECTOR",
      targetAccountId: fixture.accountId,
      autoContinue: true,
      continuationDepth: 0,
    });
    expect(mission?.parentMissionId).toBeNull();
    expect(mission?.rootMissionId).toBeNull();
    expect(mission?.directorTickId).toBeTruthy();

    const repeated = await runAgentDirectorTick({ workspaceId: fixture.workspaceId }, dependencies);
    expect(repeated.kind).toBe("NOT_DUE");
    expect(queued).toHaveLength(1);
    const [missionCount] = await db.select({ value: count() }).from(agentMissions).where(eq(agentMissions.workspaceId, fixture.workspaceId));
    expect(missionCount?.value).toBe(1);
  });

  it("does not create work while the Director profile is paused", async () => {
    const fixture = await createDirectorFixture({ paused: true });
    const queued: Array<{ workspaceId: string; missionId: string }> = [];
    const result = await runAgentDirectorTick({ workspaceId: fixture.workspaceId }, {
      ai: new MockAIProvider(),
      enqueueMission: async (input) => { queued.push(input); },
    });
    expect(result.kind).toBe("PAUSED");
    expect(queued).toHaveLength(0);
    const [missionCount] = await db.select({ value: count() }).from(agentMissions).where(eq(agentMissions.workspaceId, fixture.workspaceId));
    expect(missionCount?.value).toBe(0);
  });

  it("waits without creating work while an active Mission exists", async () => {
    const fixture = await createDirectorFixture();
    const planner = await planMission(new MockAIProvider(), {
      name: "Existing active Mission",
      objective: "Research the selected account with evidence and prepare an internal conclusion.",
      missionType: "OPPORTUNITY_DISCOVERY",
    });
    await createMission(fixture.workspaceId, fixture.userId, {
      name: "Existing active Mission",
      type: planner.data.missionType,
      objective: planner.data.objective,
      status: "RUNNING",
      targetAccountId: fixture.accountId,
      plan: planner.data,
      provider: planner.provider,
      model: planner.model,
    });
    const queued: Array<{ workspaceId: string; missionId: string }> = [];
    const result = await runAgentDirectorTick({ workspaceId: fixture.workspaceId }, {
      ai: new MockAIProvider(),
      enqueueMission: async (input) => { queued.push(input); },
    });
    expect(result.kind).toBe("WAIT");
    expect(queued).toHaveLength(0);
    const [missionCount] = await db.select({ value: count() }).from(agentMissions).where(eq(agentMissions.workspaceId, fixture.workspaceId));
    expect(missionCount?.value).toBe(1);
    const [profile] = await db.select().from(agentProfiles).where(eq(agentProfiles.workspaceId, fixture.workspaceId)).limit(1);
    expect((profile?.lastDirectorDecision as { action?: string }).action).toBe("WAIT");
  });
});
