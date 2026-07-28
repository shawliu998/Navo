import {
  buildOperationInstruction,
  missionPlanSchema,
  missionStepTypeSchema,
  type AIProvider,
  type MissionPlan,
  type MissionStepType,
  type MissionType,
  type StructuredGenerationResult,
} from "@navo/agents";

export type PlannerMode = "AI" | "DETERMINISTIC_FALLBACK";
export type MissionPlannerResult = StructuredGenerationResult<MissionPlan> & { plannerMode: PlannerMode; fallbackReason?: string };

export const missionPlannerPrompt = buildOperationInstruction(
  "mission-plan",
  `Create a bounded plan with 4 to 12 dependency-linked steps. Use each registered type at most once and use only: ${missionStepTypeSchema.options.join(", ")}.
Dependencies may reference earlier steps only. The final step must be SUMMARIZE_MISSION. CREATE_TARGET_ACCOUNT may replace SELECT_TARGET_ACCOUNTS only when a company name and website are explicitly supplied.
Use these exact executable orders:
- OPPORTUNITY_DISCOVERY, ACCOUNT_RESEARCH and ACCOUNT_QUALIFICATION: LOAD_SELLER_KNOWLEDGE → exactly one target step → FETCH_WEBSITE → RESEARCH_COMPANY → EXTRACT_SIGNALS → QUALIFY_ACCOUNT → RANK_ACCOUNTS → UPDATE_MEMORY → SUMMARIZE_MISSION. Do not add contacts, outreach or a task.
- OUTREACH_PREPARATION: LOAD_SELLER_KNOWLEDGE → exactly one target step → FETCH_WEBSITE → RESEARCH_COMPANY → EXTRACT_SIGNALS → QUALIFY_ACCOUNT → RANK_ACCOUNTS → optional DISCOVER_CONTACTS → GENERATE_OUTREACH → CREATE_TASK → UPDATE_MEMORY → SUMMARIZE_MISSION. The message must remain an English DRAFT.
- REPLY_FOLLOW_UP: LOAD_REPLY_CONTEXT → GENERATE_REPLY_DRAFT → CREATE_TASK → UPDATE_MEMORY → SUMMARIZE_MISSION. Use only the supplied replyContext; the reply loop already owns classification and conversation summaries.
Never add email sending.`,
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
  explicitCompany?: { name: string; website: string; country?: string; industry?: string };
  replyContext?: NonNullable<MissionPlan["replyContext"]>;
};

const details: Record<MissionStepType, { id: string; title: string; description: string }> = {
  LOAD_SELLER_KNOWLEDGE: { id: "load-knowledge", title: "Load seller knowledge", description: "Load products, capabilities, ICP and approved claims." },
  SELECT_TARGET_ACCOUNTS: { id: "select-accounts", title: "Select target accounts", description: "Select bounded matching accounts from the workspace." },
  CREATE_TARGET_ACCOUNT: { id: "create-target", title: "Create target account", description: "Create the explicitly supplied company and website as a mission target." },
  FETCH_WEBSITE: { id: "fetch-websites", title: "Fetch company websites", description: "Fetch bounded public pages or local fixtures." },
  RESEARCH_COMPANY: { id: "research-companies", title: "Research companies", description: "Create structured research and literal evidence." },
  EXTRACT_SIGNALS: { id: "extract-signals", title: "Extract opportunity signals", description: "Extract evidence-linked sales signals." },
  QUALIFY_ACCOUNT: { id: "qualify-accounts", title: "Qualify accounts", description: "Apply explainable deterministic qualification scoring." },
  RANK_ACCOUNTS: { id: "rank-accounts", title: "Rank accounts", description: "Compare viable accounts and select the strongest opportunity." },
  DISCOVER_CONTACTS: { id: "discover-contacts", title: "Discover decision makers", description: "Find evidence-backed public contacts for the best account." },
  GENERATE_OUTREACH: { id: "generate-outreach", title: "Generate outreach draft", description: "Prepare a concise English DRAFT without sending it." },
  LOAD_REPLY_CONTEXT: { id: "load-reply-context", title: "Load inbound reply context", description: "Load the specified inbound message and its conversation only." },
  GENERATE_REPLY_DRAFT: { id: "generate-reply-draft", title: "Generate reply draft", description: "Prepare a concise reply DRAFT without sending it." },
  CREATE_TASK: { id: "create-task", title: "Create next-step task", description: "Create an internal review task." },
  UPDATE_MEMORY: { id: "update-memory", title: "Update account memory", description: "Persist sourced account facts." },
  SUMMARIZE_MISSION: { id: "summarize-mission", title: "Summarize mission", description: "Persist the final outcome and recommended actions." },
};

const discoveryRequired: MissionStepType[] = [
  "LOAD_SELLER_KNOWLEDGE", "FETCH_WEBSITE", "RESEARCH_COMPANY", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "RANK_ACCOUNTS", "UPDATE_MEMORY", "SUMMARIZE_MISSION",
];
const outreachRequired: MissionStepType[] = [...discoveryRequired.slice(0, -2), "GENERATE_OUTREACH", "CREATE_TASK", "UPDATE_MEMORY", "SUMMARIZE_MISSION"];
const replyRequired: MissionStepType[] = ["LOAD_REPLY_CONTEXT", "GENERATE_REPLY_DRAFT", "CREATE_TASK", "UPDATE_MEMORY", "SUMMARIZE_MISSION"];

function normalizedMissionType(type: MissionType | undefined): MissionType {
  return type ?? "OUTREACH_PREPARATION";
}

function isOutreach(type: MissionType) {
  return type === "OUTREACH_PREPARATION";
}

function isReplyFollowUp(type: MissionType) {
  return type === "REPLY_FOLLOW_UP";
}

export function assertExecutableMissionPlan(plan: MissionPlan) {
  const types = plan.steps.map((step) => step.type);
  const duplicateType = types.find((type, index) => types.indexOf(type) !== index);
  if (duplicateType) throw new Error(`MISSION_PLAN_DUPLICATE_STEP_TYPE: ${duplicateType}.`);
  if (plan.steps.some((step) => step.status !== "PENDING")) throw new Error("MISSION_PLAN_INVALID_STATUS: all initial steps must be PENDING.");
  if (types.at(-1) !== "SUMMARIZE_MISSION") throw new Error("MISSION_PLAN_SUMMARY_REQUIRED: SUMMARIZE_MISSION must be the final step.");
  const targetSteps = types.filter((type) => type === "SELECT_TARGET_ACCOUNTS" || type === "CREATE_TARGET_ACCOUNT");
  if (isReplyFollowUp(plan.missionType) ? targetSteps.length !== 0 : targetSteps.length !== 1) throw new Error(isReplyFollowUp(plan.missionType) ? "MISSION_PLAN_REPLY_TARGET_STEP_INVALID: reply follow-up must not select or create accounts." : "MISSION_PLAN_TARGET_STEP_REQUIRED: include exactly one target selection or creation step.");
  const required = isReplyFollowUp(plan.missionType) ? replyRequired : isOutreach(plan.missionType) ? outreachRequired : discoveryRequired;
  for (const type of required) if (!types.includes(type)) throw new Error(`MISSION_PLAN_REQUIRED_STEP_MISSING: ${type}.`);
  if (!isOutreach(plan.missionType) && !isReplyFollowUp(plan.missionType) && types.some((type) => type === "GENERATE_OUTREACH" || type === "CREATE_TASK")) {
    throw new Error("MISSION_PLAN_DISCOVERY_SCOPE_INVALID: discovery plans must not require outreach or a task.");
  }
  if (isReplyFollowUp(plan.missionType) && types.some((type) => ["LOAD_SELLER_KNOWLEDGE", "FETCH_WEBSITE", "RESEARCH_COMPANY", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "RANK_ACCOUNTS", "DISCOVER_CONTACTS", "GENERATE_OUTREACH"].includes(type))) throw new Error("MISSION_PLAN_REPLY_SCOPE_INVALID: reply follow-up must not run account research or outreach preparation steps.");
  let previousIndex = -1;
  const ordered = isReplyFollowUp(plan.missionType)
    ? replyRequired
    : ["LOAD_SELLER_KNOWLEDGE", targetSteps[0]!, "FETCH_WEBSITE", "RESEARCH_COMPANY", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "RANK_ACCOUNTS", ...(types.includes("DISCOVER_CONTACTS") ? ["DISCOVER_CONTACTS"] : []), ...(isOutreach(plan.missionType) ? ["GENERATE_OUTREACH", "CREATE_TASK"] : []), "UPDATE_MEMORY", "SUMMARIZE_MISSION"] as MissionStepType[];
  for (const type of ordered) {
    const index = types.indexOf(type);
    if (index <= previousIndex) throw new Error(`MISSION_PLAN_INVALID_SEQUENCE: ${type} is out of order.`);
    previousIndex = index;
  }
  return plan;
}

function assertPlanMatchesPlannerInput(plan: MissionPlan, input: MissionPlannerInput) {
  const executable = assertExecutableMissionPlan(plan);
  if (executable.steps.some((step) => step.type === "CREATE_TARGET_ACCOUNT") && !input.explicitCompany) {
    throw new Error("MISSION_PLAN_CREATE_TARGET_NOT_ALLOWED: CREATE_TARGET_ACCOUNT requires an explicitly supplied company name and website.");
  }
  if (isReplyFollowUp(executable.missionType)) {
    if (!input.replyContext) throw new Error("MISSION_PLAN_REPLY_CONTEXT_REQUIRED: REPLY_FOLLOW_UP requires an inbound source message.");
    if (executable.replyContext?.sourceMessageId !== input.replyContext.sourceMessageId || executable.replyContext.conversationId !== input.replyContext.conversationId) throw new Error("MISSION_PLAN_REPLY_CONTEXT_MISMATCH: reply plans must preserve the supplied inbound message context.");
  }
  return executable;
}

export function createDeterministicMissionPlan(input: MissionPlannerInput, fallbackReason: string): MissionPlan {
  const missionType = normalizedMissionType(input.missionType);
  if (isReplyFollowUp(missionType) && !input.replyContext) throw new Error("MISSION_PLAN_REPLY_CONTEXT_REQUIRED: REPLY_FOLLOW_UP requires an inbound source message.");
  const targetType: MissionStepType = input.explicitCompany ? "CREATE_TARGET_ACCOUNT" : "SELECT_TARGET_ACCOUNTS";
  const types: MissionStepType[] = isReplyFollowUp(missionType)
    ? replyRequired
    : isOutreach(missionType)
    ? ["LOAD_SELLER_KNOWLEDGE", targetType, "FETCH_WEBSITE", "RESEARCH_COMPANY", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "RANK_ACCOUNTS", "DISCOVER_CONTACTS", "GENERATE_OUTREACH", "CREATE_TASK", "UPDATE_MEMORY", "SUMMARIZE_MISSION"]
    : ["LOAD_SELLER_KNOWLEDGE", targetType, "FETCH_WEBSITE", "RESEARCH_COMPANY", "EXTRACT_SIGNALS", "QUALIFY_ACCOUNT", "RANK_ACCOUNTS", "UPDATE_MEMORY", "SUMMARIZE_MISSION"];
  const targetCriteria = input.targetCriteria ?? {
    countries: input.sellerKnowledge?.targetRegions ?? [], industries: input.sellerKnowledge?.targetIndustries ?? [], companyTypes: ["Industrial B2B company"], keywords: ["automation", "quality", "production"],
  };
  return assertExecutableMissionPlan(missionPlanSchema.parse({
    version: 1,
    name: input.name ?? (isReplyFollowUp(missionType) ? "Autonomous reply follow-up" : isOutreach(missionType) ? "Autonomous outreach preparation" : "Autonomous opportunity discovery"),
    missionType,
    objective: input.objective,
    strategy: "Execute registered tools deterministically and use bounded decisions after website, qualification and ranking checkpoints.",
    targetDescription: input.targetDescription ?? (isReplyFollowUp(missionType) ? "Follow up on the supplied inbound conversation reply." : "Select and compare matching industrial B2B accounts from the workspace."),
    targetCriteria,
    replyContext: input.replyContext ?? null,
    steps: types.map((type, index) => ({ ...details[type], type, status: "PENDING", dependsOn: index ? [details[types[index - 1]!]!.id] : [], input: type === "CREATE_TARGET_ACCOUNT" ? input.explicitCompany : type === "LOAD_REPLY_CONTEXT" ? input.replyContext : undefined })),
    stopConditions: isReplyFollowUp(missionType) ? ["The specified inbound reply is processed", "Required reply artifacts are persisted", "Maximum iterations reached"] : ["Required artifacts are persisted", "Maximum iterations reached", "No bounded candidate remains"],
    expectedOutputs: isReplyFollowUp(missionType) ? ["Inbound reply context", "Reply DRAFT", "Task", "Account memory", "Outcome summary"] : isOutreach(missionType) ? ["Evidence", "Signals", "Qualification", "Ranking", "Optional public contact", "English DRAFT", "Task", "Memory", "Outcome summary"] : ["Evidence", "Signals", "Qualification", "Ranking or no-match outcome", "Memory", "Outcome summary"],
    assumptions: [`Deterministic fallback used: ${fallbackReason.slice(0, 350)}`, "Outreach is saved as DRAFT and is never sent."],
  }));
}

export async function planMission(ai: AIProvider, input: MissionPlannerInput): Promise<MissionPlannerResult> {
  const startedAt = Date.now();
  const missionType = normalizedMissionType(input.missionType);
  const plannerInput = { ...input, missionType, availableTools: input.availableTools ?? [...missionStepTypeSchema.options], maximumIterations: input.maximumIterations ?? 20 };
  let initialValidationError: string | undefined;
  try {
    const generated = await ai.generateStructured({
      operation: "mission-plan",
      systemInstruction: missionPlannerPrompt,
      input: plannerInput,
      outputSchema: missionPlanSchema,
      promptVersion: "mission-plan-v5",
      temperature: 0.1,
      maxTokens: 2_400,
    });
    try {
      return { ...generated, data: assertPlanMatchesPlannerInput(generated.data, input), plannerMode: "AI" };
    } catch (cause) {
      initialValidationError = cause instanceof Error ? cause.message : "Generated plan failed executable validation.";
      const repaired = await ai.generateStructured({
        operation: "mission-plan",
        systemInstruction: buildOperationInstruction("mission-plan", `Repair the supplied plan so it follows the exact required order below and passes every executable Mission rule. Preserve the objective and mission type, add every missing required step, rebuild dependencies in order, and do not explain the repair. ${missionPlannerPrompt}`),
        input: { ...plannerInput, previousPlan: generated.data, validationError: initialValidationError },
        outputSchema: missionPlanSchema,
        promptVersion: "mission-plan-repair-v2",
        temperature: 0,
        maxTokens: 2_400,
      });
      return {
        ...repaired,
        data: assertPlanMatchesPlannerInput(repaired.data, input),
        plannerMode: "AI",
        inputTokens: generated.inputTokens + repaired.inputTokens,
        outputTokens: generated.outputTokens + repaired.outputTokens,
        latencyMs: generated.latencyMs + repaired.latencyMs,
        estimatedCost: generated.estimatedCost + repaired.estimatedCost,
      };
    }
  } catch (cause) {
    const finalError = cause instanceof Error ? cause.message : "Unknown planner error";
    const fallbackReason = initialValidationError ? `Initial plan: ${initialValidationError}; repair: ${finalError}` : finalError;
    return {
      data: createDeterministicMissionPlan({ ...input, missionType }, fallbackReason),
      provider: "deterministic-fallback",
      model: isReplyFollowUp(missionType) ? "reply-follow-up-template-v1" : isOutreach(missionType) ? "outreach-template-v1" : "discovery-template-v1",
      plannerMode: "DETERMINISTIC_FALLBACK",
      fallbackReason,
      inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startedAt, estimatedCost: 0, requestId: "mission-plan-fallback",
    };
  }
}
