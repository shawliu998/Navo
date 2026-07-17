import {
  buildOperationInstruction,
  missionPlanSchema,
  missionStepTypeSchema,
  type AIProvider,
  type MissionPlan,
  type MissionType,
  type StructuredGenerationResult,
} from "@navo/agents";

export const missionPlannerPrompt = buildOperationInstruction(
  "mission-plan",
  `Create a plan with 4 to 12 dependency-linked steps. Use only these registered types: ${missionStepTypeSchema.options.join(", ")}.
For the autonomous sales golden path include seller knowledge, account selection, website fetch, company research, signals, qualification, ranking, an English DRAFT, an internal task, memory update and final summary. CREATE_TARGET_ACCOUNT is optional and only valid when a named company plus website is supplied. Never add email sending.`,
);

export type MissionPlannerInput = {
  objective: string;
  name?: string;
  missionType?: MissionType;
  targetDescription?: string;
  sellerKnowledge?: {
    companyName: string;
    companyDescription: string;
    products: string[];
    capabilities: string[];
    targetIndustries: string[];
    targetRegions: string[];
    approvedClaims: string[];
    prohibitedClaims: string[];
  };
  availableAccounts?: Array<{ id: string; name: string; website?: string; country?: string; industry?: string }>;
  availableTools?: string[];
  maximumIterations?: number;
  targetCriteria?: MissionPlan["targetCriteria"];
};

const goldenPath = [
  "LOAD_SELLER_KNOWLEDGE",
  "SELECT_TARGET_ACCOUNTS",
  "FETCH_WEBSITE",
  "RESEARCH_COMPANY",
  "EXTRACT_SIGNALS",
  "QUALIFY_ACCOUNT",
  "RANK_ACCOUNTS",
  "DISCOVER_CONTACTS",
  "GENERATE_OUTREACH",
  "CREATE_TASK",
  "UPDATE_MEMORY",
  "SUMMARIZE_MISSION",
] as const;

const goldenStepDetails: Record<(typeof goldenPath)[number], { id: string; title: string; description: string }> = {
  LOAD_SELLER_KNOWLEDGE: { id: "load-knowledge", title: "Load seller knowledge", description: "Load products, capabilities, ICP and approved claims." },
  SELECT_TARGET_ACCOUNTS: { id: "select-accounts", title: "Select target accounts", description: "Select matching accounts from the workspace." },
  FETCH_WEBSITE: { id: "fetch-websites", title: "Fetch company websites", description: "Fetch bounded public pages or local fixtures." },
  RESEARCH_COMPANY: { id: "research-companies", title: "Research companies", description: "Create structured research and literal evidence." },
  EXTRACT_SIGNALS: { id: "extract-signals", title: "Extract opportunity signals", description: "Extract evidence-linked sales signals." },
  QUALIFY_ACCOUNT: { id: "qualify-accounts", title: "Qualify accounts", description: "Apply deterministic qualification scoring." },
  RANK_ACCOUNTS: { id: "rank-accounts", title: "Rank accounts", description: "Compare qualified accounts and select the strongest opportunity." },
  DISCOVER_CONTACTS: { id: "discover-contacts", title: "Discover decision makers", description: "Find evidence-backed production, quality, automation or engineering contacts for the best account." },
  GENERATE_OUTREACH: { id: "generate-outreach", title: "Generate outreach draft", description: "Prepare an English DRAFT without sending it." },
  CREATE_TASK: { id: "create-task", title: "Create next-step task", description: "Create an internal review task." },
  UPDATE_MEMORY: { id: "update-memory", title: "Update account memory", description: "Persist sourced account facts." },
  SUMMARIZE_MISSION: { id: "summarize-mission", title: "Summarize mission", description: "Create the final persisted mission result." },
};

export function createDeterministicMissionPlan(input: MissionPlannerInput, fallbackReason: string): MissionPlan {
  const targetCriteria = input.targetCriteria ?? {
    countries: input.sellerKnowledge?.targetRegions ?? [],
    industries: input.sellerKnowledge?.targetIndustries ?? [],
    companyTypes: ["Industrial B2B company"],
    keywords: ["automation", "quality", "production"],
  };
  return missionPlanSchema.parse({
    version: 1,
    name: input.name ?? "Autonomous account research",
    missionType: input.missionType ?? "OUTREACH_PREPARATION",
    objective: input.objective,
    strategy: "Use the bounded autonomous sales golden path and persist every artifact before advancing.",
    targetDescription: input.targetDescription ?? "Select and compare matching industrial B2B accounts from the current workspace.",
    targetCriteria,
    steps: goldenPath.map((type, index) => ({
      ...goldenStepDetails[type], type, status: "PENDING" as const,
      dependsOn: index ? [goldenStepDetails[goldenPath[index - 1]!]!.id] : [],
    })),
    stopConditions: ["Best account, draft, task and memory are persisted", "Maximum iterations reached", "No executable step remains"],
    expectedOutputs: ["Compared target accounts", "Evidence and signals", "Qualifications and ranking", "Evidence-backed contact", "English DRAFT", "Internal task", "Account memory", "Mission summary"],
    assumptions: [`Planner fallback used after structured generation failed: ${fallbackReason.slice(0, 350)}`, "Outreach remains a DRAFT and is never sent."],
  });
}

export function assertExecutableMissionPlan(plan: MissionPlan) {
  if (plan.steps.length !== goldenPath.length) {
    throw new Error(`MISSION_PLAN_INVALID_LENGTH: expected ${goldenPath.length} golden-path steps.`);
  }
  for (const [index, expectedType] of goldenPath.entries()) {
    const step = plan.steps[index];
    if (!step || step.type !== expectedType) {
      throw new Error(`MISSION_PLAN_INVALID_SEQUENCE: expected ${expectedType} at position ${index + 1}.`);
    }
    if (step.status !== "PENDING") {
      throw new Error(`MISSION_PLAN_INVALID_STATUS: ${step.id} must start PENDING.`);
    }
    const expectedDependencies = index === 0 ? [] : [plan.steps[index - 1]!.id];
    if (step.dependsOn.length !== expectedDependencies.length || step.dependsOn.some((dependency, dependencyIndex) => dependency !== expectedDependencies[dependencyIndex])) {
      throw new Error(`MISSION_PLAN_INVALID_DEPENDENCY: ${step.id} must depend only on the preceding golden-path step.`);
    }
  }
  return plan;
}

export async function planMission(ai: AIProvider, input: MissionPlannerInput): Promise<StructuredGenerationResult<MissionPlan>> {
  const startedAt = Date.now();
  try {
    const generated = await ai.generateStructured({
      operation: "mission-plan",
      systemInstruction: missionPlannerPrompt,
      input: {
        name: input.name,
        objective: input.objective,
        missionType: input.missionType ?? "OUTREACH_PREPARATION",
        targetDescription: input.targetDescription ?? "Select and compare matching industrial B2B accounts from the current workspace.",
        sellerKnowledge: input.sellerKnowledge,
        availableAccounts: input.availableAccounts ?? [],
        availableTools: input.availableTools ?? [...missionStepTypeSchema.options],
        maximumIterations: input.maximumIterations ?? 20,
        targetCriteria: input.targetCriteria,
      },
      outputSchema: missionPlanSchema,
      promptVersion: "mission-plan-v3",
      temperature: 0.1,
      maxTokens: 2_400,
    });
    return { ...generated, data: assertExecutableMissionPlan(generated.data) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown planner error";
    return {
      data: assertExecutableMissionPlan(createDeterministicMissionPlan(input, message)),
      provider: "deterministic-fallback",
      model: "golden-path-v1",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      estimatedCost: 0,
      requestId: "mission-plan-fallback",
    };
  }
}
