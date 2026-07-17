import {
  type AIProvider,
  type MissionPlan,
  type MissionWorkingMemory,
  type NextStepDecision,
} from "@navo/agents";

export type StopCheck = { stop: boolean; reason?: string };

export function executablePlanSteps(plan: MissionPlan) {
  const completed = new Set(plan.steps.filter((step) => ["COMPLETED", "SKIPPED"].includes(step.status)).map((step) => step.id));
  return plan.steps.filter((step) => step.status === "PENDING" && step.dependsOn.every((dependency) => completed.has(dependency)));
}

export function checkMissionStopConditions(input: {
  plan: MissionPlan;
  workingMemory: MissionWorkingMemory;
  iteration: number;
  maximumIterations: number;
  consecutiveFailures: number;
  cancelled?: boolean;
}): StopCheck {
  if (input.cancelled) return { stop: true, reason: "Mission was cancelled." };
  if (input.iteration >= input.maximumIterations) return { stop: true, reason: "Maximum iterations reached." };
  if (input.consecutiveFailures >= 2) return { stop: true, reason: "Two consecutive steps failed." };
  const remaining = input.plan.steps.filter((step) => step.status === "PENDING" || step.status === "RUNNING");
  if (!remaining.length && input.workingMemory.bestAccountId && input.workingMemory.draftMessageIds.length) return { stop: true, reason: "All required artifacts were persisted." };
  if (!remaining.length) return { stop: true, reason: "No executable steps remain." };
  return { stop: false };
}

export async function decideNextMissionStep(input: {
  ai: AIProvider;
  objective: string;
  plan: MissionPlan;
  workingMemory: MissionWorkingMemory;
  iteration: number;
  maximumIterations: number;
}): Promise<NextStepDecision> {
  const executable = executablePlanSteps(input.plan);
  if (!executable.length) {
    const unfinished = input.plan.steps.some((step) => ["PENDING", "RUNNING"].includes(step.status));
    return unfinished
      ? { action: "FAIL", reason: "No dependency-ready registered step is available.", updatedNotes: ["Execution stopped because plan dependencies could not be satisfied."] }
      : { action: "COMPLETE", reason: "Every registered step is complete or skipped.", updatedNotes: ["The persisted plan has no remaining work."] };
  }
  const next = executable[0]!;
  return {
    action: "EXECUTE_STEP",
    stepId: next.id,
    reason: `Selected the first dependency-ready registered step: ${next.title}.`,
    updatedNotes: [],
  };
}
