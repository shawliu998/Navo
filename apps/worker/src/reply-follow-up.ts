import { and, eq } from "drizzle-orm";
import {
  agentEvents, agentMissions, agentProfiles, createMission, db, deferMissionQueue, messages, prepareMissionStart,
} from "@navo/db";
import type { AIProvider, MissionPlan } from "@navo/agents";
import { createDeterministicMissionPlan } from "@navo/workflows/mission-planner";
import { getWorkspaceAIExecutionDescriptor } from "./ai-provider-resolver";

export type ReplyFollowUpInput = { workspaceId: string; inboundMessageId: string };
export type ReplyFollowUpDependencies = {
  ai?: AIProvider;
  enqueueMission?: (input: { workspaceId: string; missionId: string }) => Promise<unknown>;
};

const fallbackUserId = "00000000-0000-4000-8000-000000000002";

async function queueReadyReplyMission(
  input: ReplyFollowUpInput,
  source: typeof messages.$inferSelect,
  mission: typeof agentMissions.$inferSelect,
  plan: MissionPlan,
  dependencies: ReplyFollowUpDependencies,
  created: boolean,
) {
  const [profile] = await db.select({ status: agentProfiles.status }).from(agentProfiles).where(eq(agentProfiles.workspaceId, input.workspaceId)).limit(1);
  if (profile?.status === "PAUSED") {
    if (created) await db.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: source.createdBy, missionId: mission.id, accountId: source.accountId, messageId: source.id, type: "REPLY_FOLLOW_UP_DEFERRED", title: "Reply follow-up Mission prepared while Navo is paused.", severity: "WARNING", metadata: { sourceMessageId: source.id } });
    return { kind: created ? "CREATED_DEFERRED" as const : "EXISTS_DEFERRED" as const, mission: { ...mission, plan } };
  }
  const started = await prepareMissionStart(input.workspaceId, source.createdBy ?? fallbackUserId, mission.id);
  if (started.kind !== "OK") return { kind: "START_FAILED" as const, reason: started.kind, mission: { ...mission, plan } };
  try {
    if (!dependencies.enqueueMission) throw new Error("REPLY_FOLLOW_UP_QUEUE_UNAVAILABLE");
    await dependencies.enqueueMission({ workspaceId: input.workspaceId, missionId: mission.id });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Reply follow-up queue submission failed.";
    const deferred = await deferMissionQueue(input.workspaceId, source.createdBy ?? fallbackUserId, mission.id, message);
    return { kind: "QUEUE_DEFERRED" as const, mission: { ...(deferred ?? mission), plan }, error: message };
  }
  await db.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: source.createdBy, missionId: mission.id, accountId: source.accountId, messageId: source.id, type: "REPLY_FOLLOW_UP_QUEUED", title: "Inbound reply created a bounded follow-up Mission.", severity: "SUCCESS", metadata: { sourceMessageId: source.id, noSend: true } });
  return { kind: created ? "CREATED_AND_QUEUED" as const : "EXISTING_AND_QUEUED" as const, mission: { ...started.mission, plan } };
}

export async function createReplyFollowUpMission(input: ReplyFollowUpInput, dependencies: ReplyFollowUpDependencies = {}) {
  const [source] = await db.select().from(messages).where(and(
    eq(messages.workspaceId, input.workspaceId),
    eq(messages.id, input.inboundMessageId),
  )).limit(1);
  if (!source || source.direction !== "INBOUND") return { kind: "INVALID_SOURCE_MESSAGE" as const };

  const [existing] = await db.select().from(agentMissions).where(and(
    eq(agentMissions.workspaceId, input.workspaceId),
    eq(agentMissions.replySourceMessageId, source.id),
  )).limit(1);
  if (existing) {
    const existingPlan = existing.plan as MissionPlan;
    if (existing.status === "READY") return queueReadyReplyMission(input, source, existing, existingPlan, dependencies, false);
    return { kind: "EXISTS" as const, mission: { ...existing, plan: existingPlan } };
  }

  const replyContext = { sourceMessageId: source.id, conversationId: source.conversationId };
  const plan = createDeterministicMissionPlan({
    name: `Follow up: ${source.subject}`.slice(0, 160),
    objective: `Prepare a safe, source-linked DRAFT and accountable internal next step for inbound reply ${source.id}.`,
    missionType: "REPLY_FOLLOW_UP",
    targetDescription: "The single supplied inbound message and its persisted conversation context.",
    replyContext,
    maximumIterations: 8,
  }, "Reply-triggered Missions use a fixed bounded plan to avoid an unnecessary planner model call.");
  const runtime = await getWorkspaceAIExecutionDescriptor(input.workspaceId);
  let mission;
  try {
    mission = await createMission(input.workspaceId, source.createdBy ?? fallbackUserId, {
      name: plan.name,
      type: "REPLY_FOLLOW_UP",
      objective: plan.objective,
      desiredOutcome: "A reply DRAFT, an accountable internal task, source-linked memory, and a persisted outcome summary; no message is sent.",
      status: "READY",
      operatingMode: "AUTONOMOUS",
      inputSource: "REPLY_RECEIVED",
      approvalPolicy: "DRAFT_ONLY",
      accountIds: [source.accountId],
      targetAccountId: source.accountId,
      targetCount: 1,
      maximumAccounts: 1,
      maximumIterations: 8,
      maximumContinuations: 0,
      autoContinue: false,
      testMode: runtime.provider !== "deepseek",
      targetCriteria: plan.targetCriteria,
      stopConditions: plan.stopConditions,
      plan,
      provider: runtime.provider,
      model: runtime.model,
      plannerMode: "DETERMINISTIC_FALLBACK",
      plannerFallbackReason: "Reply-triggered Missions use a fixed bounded plan to save a planner model call.",
      replySourceMessageId: source.id,
    });
  } catch (cause) {
    const [raced] = await db.select().from(agentMissions).where(and(
      eq(agentMissions.workspaceId, input.workspaceId),
      eq(agentMissions.replySourceMessageId, source.id),
    )).limit(1);
    if (raced) {
      const racedPlan = raced.plan as MissionPlan;
      if (raced.status === "READY") return queueReadyReplyMission(input, source, raced, racedPlan, dependencies, false);
      return { kind: "EXISTS" as const, mission: { ...raced, plan: racedPlan } };
    }
    throw cause;
  }

  return queueReadyReplyMission(input, source, mission, plan, dependencies, true);
}
