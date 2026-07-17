import {
  buildOperationInstruction,
  missionPlanSchema,
  type AIProvider,
  type MissionPlan,
  type MissionType,
  type StructuredGenerationResult,
} from "@navo/agents";

export const missionPlannerPrompt = buildOperationInstruction(
  "mission-plan",
  "Plan one selected account only. Return the six execution steps exactly once and in this order: LOAD_KNOWLEDGE, LOAD_ACCOUNT, RESEARCH_WEBSITE, EXTRACT_SIGNALS, QUALIFY_ACCOUNT, GENERATE_OUTREACH. The final step only saves a draft; it never sends or creates an approval.",
);

export type MissionPlannerInput = {
  objective: string;
  name?: string;
  missionType?: MissionType;
  targetDescription?: string;
};

const requiredStepTypes = [
  "LOAD_KNOWLEDGE",
  "LOAD_ACCOUNT",
  "RESEARCH_WEBSITE",
  "EXTRACT_SIGNALS",
  "QUALIFY_ACCOUNT",
  "GENERATE_OUTREACH",
] as const;

export function assertExecutableMissionPlan(plan: MissionPlan) {
  const actual = plan.steps.map((step) => step.type);
  if (actual.length !== requiredStepTypes.length || requiredStepTypes.some((type, index) => actual[index] !== type)) {
    throw new Error(`MISSION_PLAN_INVALID_SEQUENCE: expected ${requiredStepTypes.join(" -> ")}.`);
  }
  return plan;
}
export async function planMission(
  ai: AIProvider,
  input: MissionPlannerInput,
): Promise<StructuredGenerationResult<MissionPlan>> {
  try {
    const generated = await ai.generateStructured({
      operation: "mission-plan",
      systemInstruction: missionPlannerPrompt,
      input: {
        name: input.name,
        objective: input.objective,
        missionType: input.missionType ?? "OUTREACH_PREPARATION",
        targetDescription: input.targetDescription ?? "One selected target account and its public website.",
      },
      outputSchema: missionPlanSchema,
      promptVersion: "mission-plan-v2",
      temperature: 0.1,
      maxTokens: 1_400,
    });
    return { ...generated, data: assertExecutableMissionPlan(generated.data) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown planner error";
    throw new Error(`MISSION_PLAN_GENERATION_FAILED: ${message}`);
  }
}
