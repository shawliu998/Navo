import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import {
  accounts, agentEvents, agentMissionTargets, agentMissions, agentProfiles, createMission, db, failMissionQueue, icpProfiles, prepareMissionStart, signals, tasks,
} from "@navo/db";
import {
  agentDirectorDecisionSchema, buildOperationInstruction,
  type AIProvider, type AgentDirectorDecision, type MissionType,
} from "@navo/agents";
import { planMission } from "@navo/workflows/mission-planner";
import { resolveWorkspaceAIProvider } from "./ai-provider-resolver";

export type AgentDirectorInput = { workspaceId: string; trigger?: string; resourceId?: string };
export type AgentDirectorDependencies = {
  ai?: AIProvider;
  now?: () => Date;
  enqueueMission?: (input: { workspaceId: string; missionId: string }) => Promise<unknown>;
};

const fallbackUserId = "00000000-0000-4000-8000-000000000002";
const activeStatuses = ["PLANNING", "ACTIVE", "RUNNING", "WAITING"];

function completeCreateFields(decision: AgentDirectorDecision) {
  if (decision.action !== "CREATE_MISSION") return null;
  if (!decision.missionType || !decision.name || !decision.objective || !decision.desiredOutcome || !decision.targetCriteria) throw new Error("AGENT_DIRECTOR_DECISION_INCOMPLETE");
  return { missionType: decision.missionType, name: decision.name, objective: decision.objective, desiredOutcome: decision.desiredOutcome, targetCriteria: decision.targetCriteria };
}

async function claimTick(workspaceId: string, now: Date) {
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(agentProfiles).where(eq(agentProfiles.workspaceId, workspaceId)).for("update").limit(1);
    if (!profile) return { kind: "NO_PROFILE" as const };
    if (!profile.directorEnabled) return { kind: "DISABLED" as const, profile };
    if (profile.status === "PAUSED") return { kind: "PAUSED" as const, profile };
    if (profile.nextDirectorTickAt && profile.nextDirectorTickAt > now) return { kind: "NOT_DUE" as const, profile };
    const tickId = randomUUID();
    const nextTickAt = new Date(now.getTime() + Math.max(1, profile.directorIntervalMinutes) * 60_000);
    const [claimed] = await tx.update(agentProfiles).set({ nextDirectorTickAt: nextTickAt, lastHeartbeatAt: now, currentActivity: "Director is evaluating workspace priorities", updatedAt: now }).where(and(eq(agentProfiles.workspaceId, workspaceId), eq(agentProfiles.id, profile.id))).returning();
    return { kind: "CLAIMED" as const, profile: claimed!, tickId, nextTickAt };
  });
}

async function persistDecision(input: AgentDirectorInput, userId: string, decision: AgentDirectorDecision, now: Date, tickId: string, nextTickAt?: Date) {
  const scheduled = nextTickAt ?? new Date(now.getTime() + decision.nextCheckMinutes * 60_000);
  await db.transaction(async (tx) => {
    await tx.update(agentProfiles).set({ lastDirectorDecisionAt: now, nextDirectorTickAt: scheduled, lastDirectorDecision: { ...decision, tickId }, currentActivity: decision.action === "WAIT" ? `Director waiting: ${decision.reason}` : decision.action === "RESUME_MISSION" ? "Director resuming a prepared Mission" : "Director creating a new root Mission", lastHeartbeatAt: now, updatedAt: now }).where(eq(agentProfiles.workspaceId, input.workspaceId));
    await tx.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: userId, type: "AGENT_DIRECTOR_DECISION", title: `Director decided: ${decision.action.replaceAll("_", " ").toLowerCase()}.`, description: decision.reason, severity: decision.action === "WAIT" ? "INFO" : "SUCCESS", occurredAt: now, metadata: { tickId, action: decision.action, trigger: input.trigger ?? "SCHEDULED", resourceId: input.resourceId ?? null, nextTickAt: scheduled.toISOString(), targetAccountIds: decision.targetAccountIds, resumeMissionId: decision.resumeMissionId } });
  });
}

function waitDecision(reason: string, nextCheckMinutes: number): AgentDirectorDecision {
  return agentDirectorDecisionSchema.parse({ action: "WAIT", missionType: null, name: null, objective: null, desiredOutcome: null, targetAccountIds: [], resumeMissionId: null, targetCriteria: null, reason, nextCheckMinutes });
}

export async function runAgentDirectorTick(input: AgentDirectorInput, dependencies: AgentDirectorDependencies = {}) {
  const now = dependencies.now?.() ?? new Date();
  const claim = await claimTick(input.workspaceId, now);
  if (claim.kind !== "CLAIMED") return claim;
  const { profile, tickId } = claim;
  const userId = profile.createdBy ?? fallbackUserId;
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const [[activeCount], [dailyCount], resumable, recentDirectorTargets, eligibleRows, recentSignals, openTasks, [icp]] = await Promise.all([
    db.select({ value: count() }).from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), inArray(agentMissions.status, activeStatuses))),
    db.select({ value: count() }).from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), isNotNull(agentMissions.directorTickId), gte(agentMissions.createdAt, dayStart))),
    db.select({ id: agentMissions.id, name: agentMissions.name, objective: agentMissions.objective }).from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.status, "READY"))).orderBy(desc(agentMissions.updatedAt)).limit(5),
    db.select({ accountId: agentMissionTargets.accountId }).from(agentMissionTargets).innerJoin(agentMissions, and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, agentMissionTargets.missionId))).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), isNotNull(agentMissions.directorTickId))),
    db.select().from(accounts).where(and(eq(accounts.workspaceId, input.workspaceId), eq(accounts.suppressed, false), isNotNull(accounts.website))).orderBy(desc(accounts.fitScore), accounts.name).limit(30),
    db.select({ accountId: signals.accountId, type: signals.type, summary: signals.summary, priority: signals.priority, detectedAt: signals.detectedAt }).from(signals).where(eq(signals.workspaceId, input.workspaceId)).orderBy(desc(signals.detectedAt)).limit(10),
    db.select({ accountId: tasks.accountId, title: tasks.title, priority: tasks.priority, dueAt: tasks.dueAt }).from(tasks).where(and(eq(tasks.workspaceId, input.workspaceId), eq(tasks.status, "OPEN"))).orderBy(desc(tasks.createdAt)).limit(10),
    db.select().from(icpProfiles).where(eq(icpProfiles.workspaceId, input.workspaceId)).orderBy(desc(icpProfiles.updatedAt)).limit(1),
  ]);
  const previous = profile.lastDirectorDecision && typeof profile.lastDirectorDecision === "object" ? profile.lastDirectorDecision as { action?: unknown } : {};
  const cooldownEndsAt = profile.lastDirectorDecisionAt ? new Date(profile.lastDirectorDecisionAt.getTime() + Math.max(0, profile.directorCooldownMinutes) * 60_000) : null;
  let gated: AgentDirectorDecision | null = null;
  if ((activeCount?.value ?? 0) >= profile.directorMaxActiveMissions) gated = waitDecision("The configured active Mission limit is already reached.", profile.directorIntervalMinutes);
  else if ((dailyCount?.value ?? 0) >= profile.directorDailyMissionLimit) gated = waitDecision("The Director daily root-Mission limit is reached.", 60);
  else if (previous.action === "CREATE_MISSION" && cooldownEndsAt && cooldownEndsAt > now) gated = waitDecision("The Director cooldown after its previous root Mission is still active.", Math.max(1, Math.ceil((cooldownEndsAt.getTime() - now.getTime()) / 60_000)));
  if (gated) {
    await persistDecision(input, userId, gated, now, tickId);
    return { kind: "WAIT" as const, decision: gated };
  }

  const previouslyTargeted = new Set(recentDirectorTargets.map((target) => target.accountId));
  const eligibleAccounts = eligibleRows.filter((account) => !previouslyTargeted.has(account.id)).slice(0, 10);
  const defaultTargetCriteria = { countries: (icp?.countries as string[] | undefined) ?? [], industries: (icp?.industries as string[] | undefined) ?? [], companyTypes: ["Industrial B2B company"], keywords: ["automation", "quality", "production"] };
  const ai = dependencies.ai ?? await resolveWorkspaceAIProvider(input.workspaceId);
  const generated = await ai.generateStructured({
    operation: "agent-director",
    systemInstruction: buildOperationInstruction("agent-director"),
    input: {
      eligibleAccountIds: eligibleAccounts.map((account) => account.id),
      eligibleAccounts: eligibleAccounts.map((account) => ({ id: account.id, name: account.name, website: account.website, country: account.country, industry: account.industry, fitScore: account.fitScore, qualification: account.qualification })),
      resumableMissionIds: resumable.map((mission) => mission.id),
      resumableMissions: resumable,
      recentSignals,
      openTasks,
      wakeContext: { trigger: input.trigger ?? "SCHEDULED", resourceId: input.resourceId ?? null },
      defaultTargetCriteria,
      limits: { maximumAccounts: 3, maximumIterations: 20, maximumContinuations: 2 },
    },
    outputSchema: agentDirectorDecisionSchema,
    promptVersion: "agent-director-v1",
    temperature: 0,
    maxTokens: 1_100,
  });
  const decision = generated.data;
  const eligibleIds = new Set(eligibleAccounts.map((account) => account.id));
  if (decision.targetAccountIds.some((accountId) => !eligibleIds.has(accountId))) throw new Error("AGENT_DIRECTOR_TARGET_OUTSIDE_ELIGIBLE_SET");
  if (decision.action === "RESUME_MISSION") {
    const mission = resumable.find((candidate) => candidate.id === decision.resumeMissionId);
    if (!mission) throw new Error("AGENT_DIRECTOR_RESUME_OUTSIDE_ELIGIBLE_SET");
    const started = await prepareMissionStart(input.workspaceId, userId, mission.id);
    if (started.kind !== "OK") throw new Error(`AGENT_DIRECTOR_RESUME_FAILED: ${started.kind}`);
    try {
      if (!dependencies.enqueueMission) throw new Error("AGENT_DIRECTOR_QUEUE_UNAVAILABLE");
      await dependencies.enqueueMission({ workspaceId: input.workspaceId, missionId: mission.id });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Director resume queue failed.";
      await failMissionQueue(input.workspaceId, userId, mission.id, message);
      throw cause;
    }
    await persistDecision(input, userId, decision, now, tickId);
    return { kind: "RESUMED" as const, missionId: mission.id, decision };
  }
  const fields = completeCreateFields(decision);
  if (!fields) {
    await persistDecision(input, userId, decision, now, tickId);
    return { kind: "WAIT" as const, decision };
  }
  const selectedIds = decision.targetAccountIds.slice(0, 3);
  const planned = await planMission(ai, { name: fields.name, objective: fields.objective, missionType: fields.missionType as MissionType, targetDescription: "Director-selected unused workspace accounts matching the active ICP.", targetCriteria: fields.targetCriteria, availableAccounts: eligibleAccounts.filter((account) => selectedIds.includes(account.id)).map((account) => ({ id: account.id, name: account.name, website: account.website ?? undefined, country: account.country ?? undefined, industry: account.industry ?? undefined })), maximumIterations: 20 });
  const mission = await createMission(input.workspaceId, userId, { name: fields.name, type: fields.missionType, objective: fields.objective, desiredOutcome: fields.desiredOutcome, status: "READY", operatingMode: "AUTONOMOUS", inputSource: "AGENT_DIRECTOR", approvalPolicy: "DRAFT_ONLY", accountIds: selectedIds, targetAccountId: selectedIds[0], targetCount: selectedIds.length, maximumAccounts: selectedIds.length, maximumIterations: 20, testMode: process.env.AI_PROVIDER !== "deepseek", targetCriteria: fields.targetCriteria, stopConditions: planned.data.stopConditions, plan: planned.data, provider: planned.provider, model: planned.model, plannerMode: planned.plannerMode, plannerFallbackReason: planned.fallbackReason, autoContinue: true, maximumContinuations: 2, directorTickId: tickId });
  const started = await prepareMissionStart(input.workspaceId, userId, mission.id);
  if (started.kind !== "OK") throw new Error(`AGENT_DIRECTOR_START_FAILED: ${started.kind}`);
  try {
    if (!dependencies.enqueueMission) throw new Error("AGENT_DIRECTOR_QUEUE_UNAVAILABLE");
    await dependencies.enqueueMission({ workspaceId: input.workspaceId, missionId: mission.id });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Director Mission queue failed.";
    await failMissionQueue(input.workspaceId, userId, mission.id, message);
    throw cause;
  }
  await persistDecision(input, userId, decision, now, tickId);
  await db.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: userId, missionId: mission.id, accountId: mission.targetAccountId, type: "AGENT_DIRECTOR_MISSION_CREATED", title: "Director created and queued a new root Mission.", description: decision.reason, severity: "SUCCESS", occurredAt: now, metadata: { tickId, provider: generated.provider, model: generated.model, targetAccountIds: selectedIds } });
  return { kind: "CREATED_AND_QUEUED" as const, mission, decision };
}
