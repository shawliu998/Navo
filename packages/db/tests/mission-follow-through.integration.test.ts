import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  accounts, agentEvents, agentMissionTargets, agentMissions, auditLogs, createMission, createMissionFollowUpTask,
  createMissionRetry, db, failMissionQueue, messages, prepareMissionStart, tasks, updateMissionDraftMessage, workspaces,
} from "../src";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;
const createdWorkspaces: string[] = [];

const retryPlan = {
  name: "Research one account",
  missionType: "TARGET_ACCOUNT_DISCOVERY",
  objective: "Research one account and prepare a DRAFT-only message.",
  targetDescription: "One selected account",
  steps: [{ id: "research", type: "RESEARCH_WEBSITE", title: "Research website", description: "Save literal evidence." }],
  expectedOutputs: ["Evidence", "DRAFT message"],
  assumptions: ["Public website is available"],
};

async function fixture(status: "READY" | "COMPLETED" | "FAILED" = "READY", provider = "mock-ai") {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  createdWorkspaces.push(workspaceId);
  await db.insert(workspaces).values({ id: workspaceId, name: "Mission follow-through test", slug: `follow-through-${workspaceId}`, plan: "TEST" });
  await db.insert(accounts).values({ id: accountId, workspaceId, createdBy: userId, name: "Test Manufacturer", domain: `follow-through-${accountId}.example`, website: `https://follow-through-${accountId}.example`, country: "Germany", industry: "Industrial Equipment", source: "TEST" });
  const mission = await createMission(workspaceId, userId, {
    name: "Follow-through fixture", objective: retryPlan.objective, type: retryPlan.missionType, status: "READY", targetAccountId: accountId,
    targetCount: 1, maximumAccounts: 1, plan: retryPlan, provider, model: provider === "mock-ai" ? "deterministic-v1" : "unsupported-v1", testMode: true,
  });
  if (status !== "READY") await db.update(agentMissions).set({ status, error: status === "FAILED" ? "Original failure" : null, result: status === "FAILED" ? { messageId: randomUUID() } : {}, progress: status === "COMPLETED" ? 100 : 37, completedAt: status === "COMPLETED" || status === "FAILED" ? new Date() : null, updatedAt: new Date() }).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, mission.id)));
  return { workspaceId, userId, accountId, missionId: mission.id };
}

async function attachDraft(input: Awaited<ReturnType<typeof fixture>>, direction = "OUTBOUND", status = "DRAFT") {
  const [message] = await db.insert(messages).values({ workspaceId: input.workspaceId, createdBy: input.userId, accountId: input.accountId, direction, status, subject: "Original subject", body: "Original body contains no secret marker." }).returning();
  await db.update(agentMissions).set({ result: { messageId: message!.id }, updatedAt: new Date() }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId)));
  await db.update(agentMissionTargets).set({ messageId: message!.id, updatedAt: new Date() }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId)));
  return message!;
}

afterAll(async () => {
  for (const workspaceId of createdWorkspaces) {
    await db.delete(agentEvents).where(eq(agentEvents.workspaceId, workspaceId));
    await db.delete(auditLogs).where(eq(auditLogs.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(messages).where(eq(messages.workspaceId, workspaceId));
    await db.delete(agentMissionTargets).where(eq(agentMissionTargets.workspaceId, workspaceId));
    await db.delete(agentMissions).where(eq(agentMissions.workspaceId, workspaceId));
    await db.delete(accounts).where(eq(accounts.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  }
});

describeDatabase("Mission follow-through database integration", () => {
  it("preserves the original DRAFT exactly once, rejects non-editable messages, and records no body in audit metadata", async () => {
    const input = await fixture();
    const message = await attachDraft(input);
    const first = await updateMissionDraftMessage(input.workspaceId, input.userId, input.missionId, message.id, { subject: "Edited subject", body: "Edited body", revision: message.revision });
    expect(first.kind).toBe("OK");
    if (first.kind !== "OK") throw new Error("Expected first DRAFT edit to succeed.");
    const second = await updateMissionDraftMessage(input.workspaceId, input.userId, input.missionId, message.id, { subject: "Edited twice", body: "Edited body twice", revision: first.revision });
    expect(second.kind).toBe("OK");
    const [saved] = await db.select().from(messages).where(eq(messages.id, message.id));
    expect(saved).toMatchObject({ originalSubject: "Original subject", originalBody: "Original body contains no secret marker.", subject: "Edited twice", body: "Edited body twice" });
    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.workspaceId, input.workspaceId), eq(auditLogs.action, "DRAFT_MESSAGE_EDITED")));
    expect(JSON.stringify(audits.map((audit) => audit.metadata))).not.toContain("Edited body twice");

    const inboundInput = await fixture();
    const inbound = await attachDraft(inboundInput, "INBOUND");
    await expect(updateMissionDraftMessage(inboundInput.workspaceId, inboundInput.userId, inboundInput.missionId, inbound.id, { subject: "No", body: "No", revision: inbound.revision })).resolves.toMatchObject({ kind: "NOT_EDITABLE" });
    const sentInput = await fixture();
    const sent = await attachDraft(sentInput, "OUTBOUND", "SENT");
    await expect(updateMissionDraftMessage(sentInput.workspaceId, sentInput.userId, sentInput.missionId, sent.id, { subject: "No", body: "No", revision: sent.revision })).resolves.toMatchObject({ kind: "NOT_EDITABLE" });
  });

  it("accepts exactly one concurrent edit for an old DRAFT revision", async () => {
    const input = await fixture();
    const message = await attachDraft(input);
    const patch = { revision: message.revision };
    const results = await Promise.all([
      updateMissionDraftMessage(input.workspaceId, input.userId, input.missionId, message.id, { ...patch, subject: "Concurrent A", body: "Body A" }),
      updateMissionDraftMessage(input.workspaceId, input.userId, input.missionId, message.id, { ...patch, subject: "Concurrent B", body: "Body B" }),
    ]);
    expect(results.filter((result) => result.kind === "OK")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "CONFLICT")).toHaveLength(1);
  });

  it("creates exactly one follow-up task under concurrent calls and rejects incomplete Missions", async () => {
    const input = await fixture("COMPLETED");
    const results = await Promise.all([createMissionFollowUpTask(input.workspaceId, input.userId, input.missionId), createMissionFollowUpTask(input.workspaceId, input.userId, input.missionId)]);
    const taskIds = results.flatMap((result) => result.kind === "CREATED" || result.kind === "EXISTS" ? [result.task.id] : []);
    expect(new Set(taskIds).size).toBe(1);
    const [[taskCount], [eventCount], [auditCount]] = await Promise.all([
      db.select({ value: count() }).from(tasks).where(eq(tasks.workspaceId, input.workspaceId)),
      db.select({ value: count() }).from(agentEvents).where(and(eq(agentEvents.workspaceId, input.workspaceId), eq(agentEvents.type, "MISSION_FOLLOW_UP_TASK_CREATED"))),
      db.select({ value: count() }).from(auditLogs).where(and(eq(auditLogs.workspaceId, input.workspaceId), eq(auditLogs.action, "MISSION_FOLLOW_UP_TASK_CREATED"))),
    ]);
    expect(taskCount!.value).toBe(1);
    expect(eventCount!.value).toBe(1);
    expect(auditCount!.value).toBe(1);
    const incomplete = await fixture("READY");
    await expect(createMissionFollowUpTask(incomplete.workspaceId, incomplete.userId, incomplete.missionId)).resolves.toMatchObject({ kind: "NOT_COMPLETED" });
  });

  it("creates one linked Mock retry, preserves FAILED history, and queue failure affects only the new retry", async () => {
    const input = await fixture("FAILED");
    const results = await Promise.all([createMissionRetry(input.workspaceId, input.userId, input.missionId), createMissionRetry(input.workspaceId, input.userId, input.missionId)]);
    const retries = results.flatMap((result) => result.kind === "CREATED" || result.kind === "EXISTS" ? [result.mission] : []);
    expect(new Set(retries.map((retry) => retry.id)).size).toBe(1);
    const retry = retries[0]!;
    expect(retry).toMatchObject({ retryOfMissionId: input.missionId, status: "READY", result: {}, error: null, progress: 0, provider: "mock-ai", model: "deterministic-v1" });
    const [original] = await db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId)));
    expect(original).toMatchObject({ status: "FAILED", error: "Original failure", progress: 37 });
    await db.update(agentMissions).set({ status: "PENDING" }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, retry.id)));
    await expect(createMission(input.workspaceId, input.userId, { name: "Duplicate non-terminal retry", objective: retryPlan.objective, type: retryPlan.missionType, status: "READY", targetAccountId: input.accountId, targetCount: 1, maximumAccounts: 1, plan: retryPlan, provider: "mock-ai", model: "deterministic-v1", retryOfMissionId: input.missionId })).rejects.toThrow();
    await db.update(agentMissions).set({ status: "READY" }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, retry.id)));
    const started = await prepareMissionStart(input.workspaceId, input.userId, retry.id);
    expect(started.kind).toBe("OK");
    await failMissionQueue(input.workspaceId, input.userId, retry.id, "MISSION_QUEUE_FAILED: test queue failure");
    const [failedRetry, unchangedOriginal] = await Promise.all([
      db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, retry.id))).then((rows) => rows[0]),
      db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId))).then((rows) => rows[0]),
    ]);
    expect(failedRetry).toMatchObject({ status: "FAILED", result: {}, error: "MISSION_QUEUE_FAILED: test queue failure" });
    expect(unchangedOriginal).toMatchObject({ status: "FAILED", error: "Original failure", progress: 37 });
  });

  it("only retries FAILED Mock Missions", async () => {
    const ready = await fixture("READY");
    await expect(createMissionRetry(ready.workspaceId, ready.userId, ready.missionId)).resolves.toMatchObject({ kind: "NOT_RETRYABLE" });
    const unsupported = await fixture("FAILED", "other-ai");
    await expect(createMissionRetry(unsupported.workspaceId, unsupported.userId, unsupported.missionId)).resolves.toMatchObject({ kind: "PROVIDER_UNSUPPORTED" });
  });
});
