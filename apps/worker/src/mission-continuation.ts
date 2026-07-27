import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  accounts, agentEvents, agentMissions, agentMissionTargets, agentProfiles, createMissionContinuation, db, failMissionQueue, prepareMissionStart,
} from "@navo/db";
import {
  buildOperationInstruction, DeepSeekAIProvider, getAIProvider, missionContinuationDecisionSchema, missionPlanSchema, MockAIProvider,
  type AIProvider, type MissionContinuationDecision, type MissionResult, type MissionType,
} from "@navo/agents";
import { planMission } from "@navo/workflows/mission-planner";

export type ContinuationInput = { workspaceId: string; missionId: string };
export type ContinuationDependencies = {
  ai?: AIProvider;
  enqueueMission?: (input: ContinuationInput) => Promise<unknown>;
};

function providerForMission(provider: string | null, model: string | null) {
  if (provider === "mock-ai") return new MockAIProvider();
  if (provider === "deepseek") return new DeepSeekAIProvider(process.env.DEEPSEEK_API_KEY ?? "", { baseUrl: process.env.DEEPSEEK_BASE_URL, model: model ?? process.env.DEEPSEEK_MODEL });
  return getAIProvider();
}

async function continuationEvent(input: ContinuationInput, userId: string, values: { type: string; title: string; description?: string; severity?: string; metadata?: Record<string, unknown> }) {
  await db.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: userId, missionId: input.missionId, type: values.type, title: values.title, description: values.description, severity: values.severity ?? "INFO", occurredAt: new Date(), metadata: values.metadata ?? {} });
}

function completedResult(value: unknown) {
  return value && typeof value === "object" ? value as Partial<MissionResult> : {};
}

function requiredDecisionFields(decision: MissionContinuationDecision) {
  if (decision.action !== "CREATE_SUCCESSOR") return null;
  if (!decision.missionType || !decision.name || !decision.objective || !decision.desiredOutcome || !decision.targetCriteria) throw new Error("MISSION_CONTINUATION_DECISION_INCOMPLETE");
  return {
    missionType: decision.missionType,
    name: decision.name,
    objective: decision.objective,
    desiredOutcome: decision.desiredOutcome,
    targetCriteria: decision.targetCriteria,
  };
}

export async function scheduleMissionContinuation(input: ContinuationInput, dependencies: ContinuationDependencies = {}) {
  const [parent] = await db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId))).limit(1);
  if (!parent) return { kind: "NOT_FOUND" as const };
  if (parent.status !== "COMPLETED") return { kind: "NOT_COMPLETED" as const };
  if (!parent.autoContinue) return { kind: "DISABLED" as const };
  if (parent.continuationDepth >= parent.maximumContinuations) {
    await continuationEvent(input, parent.createdBy ?? "00000000-0000-4000-8000-000000000002", { type: "MISSION_CONTINUATION_LIMIT_REACHED", title: "Autonomous Mission chain reached its bounded limit.", metadata: { continuationDepth: parent.continuationDepth, maximumContinuations: parent.maximumContinuations } });
    return { kind: "LIMIT_REACHED" as const };
  }
  const [profile] = await db.select({ status: agentProfiles.status }).from(agentProfiles).where(eq(agentProfiles.workspaceId, input.workspaceId)).limit(1);
  if (profile?.status === "PAUSED") {
    await continuationEvent(input, parent.createdBy ?? "00000000-0000-4000-8000-000000000002", { type: "MISSION_CONTINUATION_DEFERRED", title: "Next Mission deferred while Navo is paused.", severity: "WARNING", metadata: { continuationDepth: parent.continuationDepth } });
    return { kind: "PAUSED" as const };
  }

  const rootMissionId = parent.rootMissionId ?? parent.id;
  const chain = await db.select({ id: agentMissions.id }).from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), or(eq(agentMissions.id, rootMissionId), eq(agentMissions.rootMissionId, rootMissionId))));
  const chainIds = chain.map((mission) => mission.id);
  const usedTargets = chainIds.length ? await db.select({ accountId: agentMissionTargets.accountId }).from(agentMissionTargets).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), inArray(agentMissionTargets.missionId, chainIds))) : [];
  const usedAccountIds = new Set(usedTargets.map((target) => target.accountId));
  const remainingAccounts = (await db.select().from(accounts).where(eq(accounts.workspaceId, input.workspaceId)).orderBy(desc(accounts.fitScore), accounts.name))
    .filter((account) => account.website && !account.suppressed && !usedAccountIds.has(account.id))
    .slice(0, Math.max(1, parent.maximumAccounts ?? 3));
  const result = completedResult(parent.result);
  const parsedCriteria = missionPlanSchema.shape.targetCriteria.safeParse(parent.targetCriteria);
  const targetCriteria = parsedCriteria.success ? parsedCriteria.data : { countries: [], industries: [], companyTypes: ["Industrial B2B company"], keywords: ["automation", "quality", "production"] };
  const ai = dependencies.ai ?? providerForMission(parent.provider, parent.model);
  const requiredAction = parent.type !== "OUTREACH_PREPARATION" && (result.bestAccountId || remainingAccounts.length) ? "CREATE_SUCCESSOR" : "STOP";
  const continuationInput = {
      completedMission: {
        id: parent.id,
        type: parent.type,
        objective: parent.objective,
        desiredOutcome: parent.desiredOutcome,
        outcome: result.outcome ?? null,
        summary: result.summary ?? parent.agentSummary,
        bestAccountId: result.bestAccountId ?? parent.targetAccountId,
        targetCriteria,
        continuationDepth: parent.continuationDepth,
        maximumContinuations: parent.maximumContinuations,
      },
      remainingAccounts: remainingAccounts.map((account) => ({ id: account.id, name: account.name, website: account.website, country: account.country, industry: account.industry, fitScore: account.fitScore })),
      requiredAction,
      remainingContinuationSlots: parent.maximumContinuations - parent.continuationDepth,
  };
  let generated = await ai.generateStructured({
    operation: "mission-continuation",
    systemInstruction: buildOperationInstruction("mission-continuation"),
    input: continuationInput,
    outputSchema: missionContinuationDecisionSchema,
    promptVersion: "mission-continuation-v1",
    temperature: 0,
    maxTokens: 900,
  });
  if (generated.data.action !== requiredAction) {
    generated = await ai.generateStructured({
      operation: "mission-continuation",
      systemInstruction: buildOperationInstruction("mission-continuation", `Repair the decision. requiredAction is ${requiredAction}; returning any other action is invalid. Populate every required successor field when creating a successor.`),
      input: { ...continuationInput, previousDecision: generated.data, validationError: `Expected action ${requiredAction}, received ${generated.data.action}.` },
      outputSchema: missionContinuationDecisionSchema,
      promptVersion: "mission-continuation-repair-v1",
      temperature: 0,
      maxTokens: 900,
    });
    if (generated.data.action !== requiredAction) throw new Error(`MISSION_CONTINUATION_ACTION_INVALID: expected ${requiredAction}, received ${generated.data.action}.`);
  }
  const decision = generated.data;
  await continuationEvent(input, parent.createdBy ?? "00000000-0000-4000-8000-000000000002", { type: "MISSION_CONTINUATION_DECIDED", title: decision.action === "CREATE_SUCCESSOR" ? "Navo decided to continue with another bounded Mission." : "Navo decided the Mission chain is complete.", description: decision.reason, metadata: { action: decision.action, provider: generated.provider, model: generated.model, continuationDepth: parent.continuationDepth } });
  const fields = requiredDecisionFields(decision);
  if (!fields) return { kind: "STOPPED" as const, decision };

  const bestAccountId = result.bestAccountId ?? parent.targetAccountId;
  const allowedAccountIds = new Set([...remainingAccounts.map((account) => account.id), ...(bestAccountId ? [bestAccountId] : [])]);
  const targetAccountId = (fields.missionType === "OUTREACH_PREPARATION" && bestAccountId)
    ? bestAccountId
    : decision.targetAccountId ?? remainingAccounts[0]?.id ?? null;
  if (targetAccountId && !allowedAccountIds.has(targetAccountId)) throw new Error("MISSION_CONTINUATION_TARGET_OUTSIDE_ALLOWED_SET");
  if (!targetAccountId) return { kind: "STOPPED_NO_TARGET" as const, decision };
  if (decision.targetAccountId && decision.targetAccountId !== targetAccountId) {
    await continuationEvent(input, parent.createdBy ?? "00000000-0000-4000-8000-000000000002", { type: "MISSION_CONTINUATION_TARGET_NORMALIZED", title: "Successor target normalized to the predecessor's best account.", description: "Cross-stage data flow keeps outreach focused on the qualified best account.", metadata: { requestedTargetAccountId: decision.targetAccountId, targetAccountId } });
  }
  const discoveryAccountIds = fields.missionType === "OUTREACH_PREPARATION" ? [targetAccountId] : remainingAccounts.map((account) => account.id);
  const planned = await planMission(ai, {
    name: fields.name,
    objective: fields.objective,
    missionType: fields.missionType as MissionType,
    targetDescription: fields.missionType === "OUTREACH_PREPARATION" ? "The strongest qualified account selected by the predecessor Mission." : "Unused workspace accounts remaining in this bounded autonomous chain.",
    targetCriteria: fields.targetCriteria,
    availableAccounts: remainingAccounts.map((account) => ({ id: account.id, name: account.name, website: account.website ?? undefined, country: account.country ?? undefined, industry: account.industry ?? undefined })),
    maximumIterations: parent.maximumIterations,
  });
  const userId = parent.createdBy ?? "00000000-0000-4000-8000-000000000002";
  const created = await createMissionContinuation(input.workspaceId, userId, parent.id, {
    name: fields.name,
    type: fields.missionType,
    objective: fields.objective,
    desiredOutcome: fields.desiredOutcome,
    operatingMode: "AUTONOMOUS",
    inputSource: parent.inputSource,
    approvalPolicy: parent.approvalPolicy,
    accountIds: discoveryAccountIds,
    targetAccountId,
    targetCount: discoveryAccountIds.length,
    maximumAccounts: fields.missionType === "OUTREACH_PREPARATION" ? 1 : Math.max(1, Math.min(parent.maximumAccounts ?? 3, discoveryAccountIds.length)),
    maximumIterations: parent.maximumIterations,
    estimatedCostLimit: parent.estimatedCostLimit === null ? undefined : Number(parent.estimatedCostLimit),
    testMode: parent.testMode,
    targetCriteria: fields.targetCriteria,
    stopConditions: planned.data.stopConditions,
    plan: planned.data,
    provider: planned.provider,
    model: planned.model,
    plannerMode: planned.plannerMode,
    plannerFallbackReason: planned.fallbackReason,
  });
  if (created.kind !== "CREATED" && created.kind !== "EXISTS") return created;
  const successor = created.mission;
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(successor.status)) return { kind: "EXISTS_TERMINAL" as const, mission: successor };
  const started = await prepareMissionStart(input.workspaceId, userId, successor.id);
  if (started.kind !== "OK") return { kind: "START_FAILED" as const, reason: started.kind, mission: successor };
  try {
    if (!dependencies.enqueueMission) throw new Error("MISSION_CONTINUATION_QUEUE_UNAVAILABLE");
    await dependencies.enqueueMission({ workspaceId: input.workspaceId, missionId: successor.id });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Mission continuation queue failed.";
    await failMissionQueue(input.workspaceId, userId, successor.id, message);
    await continuationEvent(input, userId, { type: "MISSION_CONTINUATION_QUEUE_FAILED", title: "The next Mission could not enter the queue.", description: message, severity: "ERROR", metadata: { continuationMissionId: successor.id } });
    return { kind: "QUEUE_FAILED" as const, mission: successor };
  }
  await continuationEvent(input, userId, { type: "MISSION_CONTINUATION_QUEUED", title: "The next autonomous Mission entered the execution queue.", severity: "SUCCESS", metadata: { continuationMissionId: successor.id, continuationDepth: successor.continuationDepth } });
  return { kind: created.kind === "CREATED" ? "CREATED_AND_QUEUED" as const : "EXISTING_AND_QUEUED" as const, mission: successor, decision };
}
