import {
  buildOperationInstruction,
  qualificationCheckpointDecisionSchema,
  rankingCheckpointDecisionSchema,
  websiteCheckpointDecisionSchema,
  type AIProvider,
  type MissionPlan,
  type MissionWorkingMemory,
  type NextStepDecision,
  type QualificationCheckpointDecision,
  type RankingCheckpointDecision,
  type WebsiteCheckpointDecision,
} from "@navo/agents";

export function executablePlanSteps(plan: MissionPlan) {
  const completed = new Set(plan.steps.filter((step) => ["COMPLETED", "SKIPPED"].includes(step.status)).map((step) => step.id));
  return plan.steps.filter((step) => step.status === "PENDING" && step.dependsOn.every((dependency) => completed.has(dependency)));
}

export function decideNextMissionStep(input: { plan: MissionPlan; iteration: number; maximumIterations: number }): NextStepDecision {
  if (input.iteration >= input.maximumIterations) return { action: "FAIL", reason: "Maximum iterations reached.", decisionSummary: "The bounded execution limit stopped the mission.", updatedNotes: [] };
  const ready = executablePlanSteps(input.plan);
  if (ready[0]) return { action: "EXECUTE_STEP", stepId: ready[0].id, reason: `Dependencies are complete for ${ready[0].title}.`, decisionSummary: `Execute registered step ${ready[0].type}.`, updatedNotes: [] };
  if (input.plan.steps.every((step) => ["COMPLETED", "SKIPPED"].includes(step.status))) return { action: "COMPLETE", reason: "All planned steps are complete.", decisionSummary: "The bounded plan has no remaining work.", updatedNotes: [] };
  const failed = input.plan.steps.find((step) => step.status === "FAILED");
  return { action: "FAIL", reason: failed ? `${failed.title} failed: ${failed.error ?? "unknown error"}` : "No dependency-ready step remains.", decisionSummary: "Execution cannot advance within the registered plan.", updatedNotes: [] };
}

export function checkMissionStopConditions(input: { plan: MissionPlan; workingMemory: MissionWorkingMemory; iteration: number; maximumIterations: number; cancelled: boolean }) {
  if (input.cancelled) return { stop: true, reason: "Mission was cancelled." };
  if (input.iteration >= input.maximumIterations) return { stop: true, reason: "Maximum iterations reached." };
  if (input.plan.steps.every((step) => ["COMPLETED", "SKIPPED"].includes(step.status))) return { stop: true, reason: "All mission plan steps are complete." };
  return { stop: false, reason: null };
}

export async function decideWebsiteCheckpoint(ai: AIProvider, input: Record<string, unknown>): Promise<WebsiteCheckpointDecision> {
  const generated = await ai.generateStructured({ operation: "website-checkpoint", systemInstruction: buildOperationInstruction("website-checkpoint", "Select additionalAccountIds only from remainingAccountIds."), input, outputSchema: websiteCheckpointDecisionSchema, promptVersion: "website-checkpoint-v1", temperature: 0, maxTokens: 650 });
  const remaining = new Set(strings(input.remainingAccountIds));
  const accessible = strings(input.accessibleAccountIds);
  if (generated.data.action === "FAIL") return generated.data;
  if (accessible.length && generated.data.action === "COMPLETE_NO_ACCESSIBLE_ACCOUNTS") {
    return { action: "CONTINUE_WITH_ACCESSIBLE_ACCOUNTS", additionalAccountIds: [], reason: "At least one selected website is accessible.", decisionSummary: `Continue with ${accessible.length} accessible account(s).` };
  }
  if (!accessible.length && generated.data.action === "CONTINUE_WITH_ACCESSIBLE_ACCOUNTS") {
    return remaining.size
      ? { action: "SELECT_MORE_ACCOUNTS", additionalAccountIds: [...remaining].slice(0, 3), reason: "No selected website is accessible and bounded candidates remain.", decisionSummary: "Select bounded replacement accounts." }
      : { action: "COMPLETE_NO_ACCESSIBLE_ACCOUNTS", additionalAccountIds: [], reason: "No website is accessible and no bounded candidate remains.", decisionSummary: "Complete without an opportunity because no public website could be researched." };
  }
  if (generated.data.action !== "SELECT_MORE_ACCOUNTS") return generated.data;
  const additionalAccountIds = generated.data.additionalAccountIds.filter((id) => remaining.has(id));
  if (additionalAccountIds.length) return { ...generated.data, additionalAccountIds };
  return accessible.length
    ? { action: "CONTINUE_WITH_ACCESSIBLE_ACCOUNTS", additionalAccountIds: [], reason: "The proposed replacement accounts were outside the bounded candidate set.", decisionSummary: `Continue with ${accessible.length} accessible account(s).` }
    : { action: "COMPLETE_NO_ACCESSIBLE_ACCOUNTS", additionalAccountIds: [], reason: "No valid bounded replacement account remains.", decisionSummary: "Complete without an opportunity because no public website could be researched." };
}

export async function decideQualificationCheckpoint(ai: AIProvider, input: Record<string, unknown>): Promise<QualificationCheckpointDecision> {
  const generated = await ai.generateStructured({ operation: "qualification-checkpoint", systemInstruction: buildOperationInstruction("qualification-checkpoint", "A score of 60 or above is viable. Select additionalAccountIds only from remainingAccountIds."), input, outputSchema: qualificationCheckpointDecisionSchema, promptVersion: "qualification-checkpoint-v1", temperature: 0, maxTokens: 700 });
  const remaining = new Set(strings(input.remainingAccountIds));
  const accounts = Array.isArray(input.accounts) ? input.accounts.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  const viable = accounts.filter((item) => Number(item.score ?? 0) >= 60);
  if (generated.data.action === "FAIL") return generated.data;
  if (generated.data.action === "COMPLETE_NO_MATCH" && viable.length) {
    return viable.length === 1 && Number(viable[0]?.score ?? 0) >= 80
      ? { action: "USE_SINGLE_STRONG_ACCOUNT", additionalAccountIds: [], reason: "One account meets the strong-fit threshold.", decisionSummary: "Use the single strong account." }
      : { action: "PROCEED_TO_RANKING", additionalAccountIds: [], reason: "Viable accounts are available for ranking.", decisionSummary: `Rank ${viable.length} viable account(s).` };
  }
  if (generated.data.action === "PROCEED_TO_RANKING" && !viable.length) {
    return remaining.size
      ? { action: "RESEARCH_MORE_ACCOUNTS", additionalAccountIds: [...remaining].slice(0, 3), reason: "No viable account exists and bounded candidates remain.", decisionSummary: "Research additional bounded candidates." }
      : { action: "COMPLETE_NO_MATCH", additionalAccountIds: [], reason: "No account meets the qualification threshold.", decisionSummary: "Complete with no suitable match." };
  }
  if (generated.data.action !== "RESEARCH_MORE_ACCOUNTS") return generated.data;
  const additionalAccountIds = generated.data.additionalAccountIds.filter((id) => remaining.has(id));
  if (additionalAccountIds.length) return { ...generated.data, additionalAccountIds };
  if (viable.length >= 2) return { action: "PROCEED_TO_RANKING", additionalAccountIds: [], reason: "No valid bounded replacement remains, but multiple viable accounts are ready.", decisionSummary: `Rank ${viable.length} viable accounts.` };
  if (viable.length === 1 && Number(viable[0]?.score ?? 0) >= 80) return { action: "USE_SINGLE_STRONG_ACCOUNT", additionalAccountIds: [], reason: "No valid replacement remains and one account is a strong fit.", decisionSummary: "Use the single strong account." };
  return { action: "COMPLETE_NO_MATCH", additionalAccountIds: [], reason: "No valid bounded replacement or suitable match remains.", decisionSummary: "Complete with no suitable match." };
}

export async function decideRankingCheckpoint(ai: AIProvider, input: Record<string, unknown>): Promise<RankingCheckpointDecision> {
  const generated = await ai.generateStructured({ operation: "ranking-checkpoint", systemInstruction: buildOperationInstruction("ranking-checkpoint", "Never choose an outreach action for an opportunity-discovery mission."), input, outputSchema: rankingCheckpointDecisionSchema, promptVersion: "ranking-checkpoint-v1", temperature: 0, maxTokens: 600 });
  if (input.missionType !== "OUTREACH_PREPARATION" && generated.data.action !== "COMPLETE_DISCOVERY_MISSION" && generated.data.action !== "FAIL") {
    return { action: "COMPLETE_DISCOVERY_MISSION", reason: "The mission scope does not authorize outreach preparation.", decisionSummary: "Complete after persisting the ranked opportunity." };
  }
  return generated.data;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
