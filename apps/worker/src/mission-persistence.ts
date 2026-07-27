import { and, eq, inArray } from "drizzle-orm";
import { agentMissions, agentPlanSteps, db } from "@navo/db";
import type { MissionPlan, MissionStepType, MissionWorkingMemory } from "@navo/agents";

export type MissionRunIdentity = { workspaceId: string; missionId: string };
export type MissionPersistenceRuntime = {
  mission: typeof agentMissions.$inferSelect;
  now: () => Date;
  plan: MissionPlan;
  memory: MissionWorkingMemory;
  result: unknown;
};

export async function persistRuntime(input: MissionRunIdentity, runtime: MissionPersistenceRuntime, currentStep: string, provider?: string, model?: string) {
  const completed = runtime.plan.steps.filter((step) => ["COMPLETED", "SKIPPED"].includes(step.status)).length;
  const progress = Math.round(completed / runtime.plan.steps.length * 100);
  await db.update(agentMissions).set({
    workingMemory: runtime.memory,
    result: runtime.result,
    iteration: runtime.mission.iteration,
    progress,
    currentStep,
    agentSummary: runtime.memory.lastObservation ?? currentStep,
    provider: provider ?? runtime.mission.provider,
    model: model ?? runtime.mission.model,
    updatedAt: runtime.now(),
  }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING")));
}

export async function markStep(input: MissionRunIdentity, runtime: MissionPersistenceRuntime, stepId: string, status: "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED", output: Record<string, unknown> = {}, error?: string) {
  const step = runtime.plan.steps.find((item) => item.id === stepId);
  if (!step) throw new Error(`MISSION_PLAN_STEP_MISSING: ${stepId}`);
  step.status = status;
  step.output = output;
  step.error = error;
  const changedAt = runtime.now();
  await db.update(agentPlanSteps).set({ status, output, errorCode: error?.split(":", 1)[0]?.slice(0, 120), errorMessage: error, startedAt: status === "RUNNING" ? changedAt : undefined, completedAt: status === "RUNNING" ? null : changedAt, updatedAt: changedAt })
    .where(and(eq(agentPlanSteps.workspaceId, input.workspaceId), eq(agentPlanSteps.missionId, input.missionId), eq(agentPlanSteps.relatedPlayNodeId, step.type)));
}

export async function skipPendingSteps(input: MissionRunIdentity, runtime: MissionPersistenceRuntime, types: MissionStepType[], reason: string) {
  for (const step of runtime.plan.steps) {
    if (step.status === "PENDING" && types.includes(step.type)) await markStep(input, runtime, step.id, "SKIPPED", { reason });
  }
}

export async function resetPlanSteps(input: MissionRunIdentity, runtime: MissionPersistenceRuntime, types: MissionStepType[]) {
  for (const step of runtime.plan.steps) {
    if (!types.includes(step.type)) continue;
    step.status = "PENDING";
    step.output = {};
    step.error = undefined;
  }
  await db.update(agentPlanSteps).set({ status: "PENDING", output: {}, errorCode: null, errorMessage: null, startedAt: null, completedAt: null, durationMs: null, updatedAt: runtime.now() })
    .where(and(eq(agentPlanSteps.workspaceId, input.workspaceId), eq(agentPlanSteps.missionId, input.missionId), inArray(agentPlanSteps.relatedPlayNodeId, types)));
}
