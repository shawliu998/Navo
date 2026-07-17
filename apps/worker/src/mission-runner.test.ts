import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  emptyMissionWorkingMemory, MockAIProvider, type CompanyResearchOutput, type MissionPlan, type StructuredGenerationRequest, type StructuredGenerationResult,
} from "@navo/agents";
import {
  accounts, agentMissions, agentPlanSteps, approvals, approvedClaims, contacts, createMission, db, evidence, icpProfiles, messages,
  memoryFacts, prepareMissionStart, products, qualificationResults, signals, tasks, toolCalls, workspaces,
} from "@navo/db";
import { planMission } from "@navo/workflows/mission-planner";
import { loadLocalWebsiteResearchFixture } from "@navo/workflows/website-research/fixture";
import { executeMissionDirect } from "./mission-runner";

async function createTestMission(accountCount = 1) {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  await db.insert(workspaces).values({ id: workspaceId, name: "Nova Automation", slug: `mission-test-${workspaceId}`, plan: "TEST" });
  const [product] = await db.insert(products).values({ workspaceId, createdBy: userId, nameZh: "视觉检测", nameEn: "Vision Inspection", category: "Machine Vision", capabilities: ["Inline quality inspection"], prohibitedClaims: ["guaranteed accuracy"], status: "ACTIVE" }).returning({ id: products.id });
  await db.insert(approvedClaims).values({ workspaceId, createdBy: userId, productId: product!.id, claim: "Compatible with common industrial camera interfaces.", approvedBy: userId, approvedAt: new Date(), allowedRegions: ["GLOBAL"], status: "APPROVED" });
  await db.insert(icpProfiles).values({ workspaceId, createdBy: userId, name: "Industrial ICP", countries: ["Germany"], industries: ["Automotive Components"], hardExclusions: ["Consumer-only", "Services-only"], scoringWeights: {}, minimumScore: 60 });
  await db.insert(accounts).values({ id: accountId, workspaceId, createdBy: userId, name: "Demo Mission Manufacturer GmbH", domain: `mission-${accountId}-demo.example`, website: `https://mission-${accountId}-demo.example`, country: "Germany", industry: "Automotive Components", source: "DEMO", qualification: "NOT_RESEARCHED", playStatus: "NOT_STARTED" });
  const additionalAccountId = randomUUID();
  if (accountCount > 1) await db.insert(accounts).values({ id: additionalAccountId, workspaceId, createdBy: userId, name: "Demo Mission Components AG", domain: `mission-${additionalAccountId}-demo.example`, website: `https://mission-${additionalAccountId}-demo.example`, country: "Germany", industry: "Automotive Components", source: "DEMO", qualification: "NOT_RESEARCHED", playStatus: "NOT_STARTED" });
  const mock = new MockAIProvider();
  const generated = await planMission(mock, { objective: "Research this German manufacturer and prepare a safe English outreach draft." });
  const mission = await createMission(workspaceId, userId, { name: "Mission runner test", objective: generated.data.objective, type: generated.data.missionType, status: "READY", targetAccountId: accountId, plan: generated.data, provider: generated.provider, model: generated.model, targetCount: 0, maximumAccounts: accountCount, testMode: true });
  return { workspaceId, accountId, additionalAccountId, userId, missionId: mission.id };
}

async function missionState(workspaceId: string, missionId: string) {
  const [mission] = await db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId))).limit(1);
  return mission!;
}

class ThrowingProvider extends MockAIProvider {
  override async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    if (request.operation === "company-research") throw new Error("TEST_AI_FAILURE");
    return super.generateStructured(request);
  }
}

class InvalidQuoteProvider extends MockAIProvider {
  override async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const result = await super.generateStructured(request);
    if (request.operation !== "company-research") return result;
    const data = result.data as CompanyResearchOutput;
    return { ...result, data: { ...data, evidence: data.evidence.map((item) => ({ ...item, quote: "This quote was never present in the fetched HTML." })) } as T };
  }
}

describe("autonomous mission runner integration", () => {
  it("completes a Mock mission and persists every required artifact", async () => {
    const fixture = await createTestMission();
    const result = await executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId });
    const mission = await missionState(fixture.workspaceId, fixture.missionId);
    expect(mission.status).toBe("COMPLETED");
    expect(mission.progress).toBe(100);
    expect(result.messageId).toBeTruthy();
    const [[evidenceCount], [signalCount], [qualificationCount], [contactCount], [draftCount], [approvalCount], [taskCount], [memoryCount], [toolCallCount]] = await Promise.all([
      db.select({ value: count() }).from(evidence).where(and(eq(evidence.workspaceId, fixture.workspaceId), eq(evidence.accountId, fixture.accountId))),
      db.select({ value: count() }).from(signals).where(and(eq(signals.workspaceId, fixture.workspaceId), eq(signals.accountId, fixture.accountId))),
      db.select({ value: count() }).from(qualificationResults).where(and(eq(qualificationResults.workspaceId, fixture.workspaceId), eq(qualificationResults.accountId, fixture.accountId))),
      db.select({ value: count() }).from(contacts).where(and(eq(contacts.workspaceId, fixture.workspaceId), eq(contacts.missionId, fixture.missionId))),
      db.select({ value: count() }).from(messages).where(and(eq(messages.workspaceId, fixture.workspaceId), eq(messages.accountId, fixture.accountId), eq(messages.status, "DRAFT"))),
      db.select({ value: count() }).from(approvals).where(and(eq(approvals.workspaceId, fixture.workspaceId), eq(approvals.accountId, fixture.accountId))),
      db.select({ value: count() }).from(tasks).where(and(eq(tasks.workspaceId, fixture.workspaceId), eq(tasks.missionId, fixture.missionId))),
      db.select({ value: count() }).from(memoryFacts).where(and(eq(memoryFacts.workspaceId, fixture.workspaceId), eq(memoryFacts.missionId, fixture.missionId))),
      db.select({ value: count() }).from(toolCalls).where(and(eq(toolCalls.workspaceId, fixture.workspaceId), eq(toolCalls.status, "COMPLETED"))),
    ]);
    expect(evidenceCount!.value).toBeGreaterThan(0);
    expect(signalCount!.value).toBeGreaterThan(0);
    expect(qualificationCount!.value).toBe(1);
    expect(contactCount!.value).toBe(1);
    expect(draftCount!.value).toBe(1);
    expect(approvalCount!.value).toBe(0);
    expect(taskCount!.value).toBe(1);
    expect(memoryCount!.value).toBe(5);
    expect(toolCallCount!.value).toBeGreaterThanOrEqual(12);
    expect((mission.result as { bestAccountId?: string }).bestAccountId).toBe(fixture.accountId);
    expect((mission.result as { bestContactId?: string }).bestContactId).toBeTruthy();
    expect((mission.workingMemory as { bestAccountId?: string }).bestAccountId).toBe(fixture.accountId);

    await executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId });
    const [replayedDraftCount] = await db.select({ value: count() }).from(messages).where(and(eq(messages.workspaceId, fixture.workspaceId), eq(messages.missionId, fixture.missionId)));
    expect(replayedDraftCount!.value).toBe(1);
  }, 20_000);

  it("recovers an interrupted RUNNING step and rebuilds runtime context", async () => {
    const fixture = await createTestMission();
    await prepareMissionStart(fixture.workspaceId, fixture.userId, fixture.missionId);
    const mission = await missionState(fixture.workspaceId, fixture.missionId);
    const plan = mission.plan as MissionPlan;
    plan.steps[0]!.status = "COMPLETED";
    plan.steps[1]!.status = "RUNNING";
    await db.update(agentMissions).set({ plan, workingMemory: { ...emptyMissionWorkingMemory(), sellerKnowledgeLoaded: true }, iteration: 1 }).where(eq(agentMissions.id, fixture.missionId));
    await db.update(agentPlanSteps).set({ status: "COMPLETED", output: { loaded: true } }).where(and(eq(agentPlanSteps.missionId, fixture.missionId), eq(agentPlanSteps.relatedPlayNodeId, "LOAD_SELLER_KNOWLEDGE")));
    await db.update(agentPlanSteps).set({ status: "RUNNING" }).where(and(eq(agentPlanSteps.missionId, fixture.missionId), eq(agentPlanSteps.relatedPlayNodeId, "SELECT_TARGET_ACCOUNTS")));

    await executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, { ai: new MockAIProvider() });
    const recovered = await missionState(fixture.workspaceId, fixture.missionId);
    expect(recovered.status).toBe("COMPLETED");
    expect(recovered.targetCount).toBe(1);
    expect((recovered.workingMemory as { selectedAccountIds: string[] }).selectedAccountIds).toContain(fixture.accountId);
  }, 20_000);

  it("continues with an accessible account after one website fails", async () => {
    const fixture = await createTestMission(2);
    await executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, {
      ai: new MockAIProvider(),
      websiteResearch: async ({ accountId, websiteUrl }) => accountId === fixture.additionalAccountId
        ? { ok: false, error: { code: "FETCH_FAILED", message: "fixture account unavailable" } }
        : { ok: true, data: await loadLocalWebsiteResearchFixture(accountId, websiteUrl) },
    });
    const mission = await missionState(fixture.workspaceId, fixture.missionId);
    expect(mission.status).toBe("COMPLETED");
    expect(mission.targetCount).toBe(2);
    expect(mission.processedCount).toBe(1);
    expect(mission.replanCount).toBe(1);
  }, 20_000);

  it("does not overwrite CANCELLED with FAILED when cancellation races a tool error", async () => {
    const fixture = await createTestMission();
    class CancellingProvider extends MockAIProvider {
      override async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
        if (request.operation === "company-research") {
          await db.update(agentMissions).set({ status: "CANCELLED" }).where(eq(agentMissions.id, fixture.missionId));
          throw new Error("TOOL_ABORTED_AFTER_CANCEL");
        }
        return super.generateStructured(request);
      }
    }
    await expect(executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, { ai: new CancellingProvider() })).rejects.toThrow("TOOL_ABORTED_AFTER_CANCEL");
    expect((await missionState(fixture.workspaceId, fixture.missionId)).status).toBe("CANCELLED");
  }, 20_000);

  it("persists a clear failure when the iteration bound is reached", async () => {
    const fixture = await createTestMission();
    await db.update(agentMissions).set({ maximumIterations: 2 }).where(eq(agentMissions.id, fixture.missionId));
    await expect(executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, { ai: new MockAIProvider() })).rejects.toThrow("Maximum iterations reached");
    const mission = await missionState(fixture.workspaceId, fixture.missionId);
    expect(mission.status).toBe("FAILED");
    expect(mission.iteration).toBe(2);
    expect(mission.error).toContain("Maximum iterations reached");
  }, 20_000);

  it("persists FAILED when website fetching fails", async () => {
    const fixture = await createTestMission();
    await expect(executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, { ai: new MockAIProvider(), websiteResearch: async () => ({ ok: false, error: { code: "FETCH_FAILED", message: "fixture fetch failed" } }) })).rejects.toThrow("WEBSITE_RESEARCH_FAILED");
    const mission = await missionState(fixture.workspaceId, fixture.missionId);
    expect(mission.status).toBe("FAILED");
    expect(mission.error).toContain("FETCH_FAILED");
  }, 20_000);

  it("persists FAILED when AI generation fails", async () => {
    const fixture = await createTestMission();
    await expect(executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, { ai: new ThrowingProvider() })).rejects.toThrow("TEST_AI_FAILURE");
    expect((await missionState(fixture.workspaceId, fixture.missionId)).status).toBe("FAILED");
  }, 20_000);

  it("persists FAILED when an evidence quote is not literal", async () => {
    const fixture = await createTestMission();
    await expect(executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: fixture.missionId }, { ai: new InvalidQuoteProvider() })).rejects.toThrow("RESEARCH_EVIDENCE_EMPTY");
    const mission = await missionState(fixture.workspaceId, fixture.missionId);
    expect(mission.status).toBe("FAILED");
    expect(mission.error).toContain("EVIDENCE_EMPTY");
  }, 20_000);
});
