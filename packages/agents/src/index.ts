import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

export type StructuredGenerationRequest<T> = {
  operation: string;
  systemInstruction: string;
  input: unknown;
  outputSchema: z.ZodType<T>;
  promptVersion: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type StructuredGenerationResult<T> = {
  data: T;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCost: number;
  requestId?: string;
};

export interface AIProvider {
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>>;
}

export const missionTypeSchema = z.enum([
  "TARGET_ACCOUNT_DISCOVERY",
  "EXPANSION_SIGNAL_OUTREACH",
  "TRADE_SHOW_LIST_QUALIFICATION",
  "REPLY_FOLLOW_UP",
]);
export type MissionType = z.infer<typeof missionTypeSchema>;

export const missionStepTypeSchema = z.enum([
  "LOAD_KNOWLEDGE",
  "LOAD_ACCOUNT",
  "RESEARCH_WEBSITE",
  "EXTRACT_SIGNALS",
  "QUALIFY_ACCOUNT",
  "GENERATE_OUTREACH",
]);
export type MissionStepType = z.infer<typeof missionStepTypeSchema>;

export const missionPlanStepSchema = z.object({
  step: missionStepTypeSchema,
  objective: z.string().trim().min(1).max(500),
  expectedOutput: z.string().trim().min(1).max(500),
}).strict();

export const missionPlanSchema = z.object({
  missionType: missionTypeSchema,
  objective: z.string().trim().min(1).max(2_000),
  summary: z.string().trim().min(1).max(1_000),
  steps: z.array(missionPlanStepSchema).min(1).max(6),
  guardrails: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
}).strict().superRefine((plan, context) => {
  const duplicates = plan.steps.filter((step, index) => plan.steps.findIndex((candidate) => candidate.step === step.step) !== index);
  if (duplicates.length) context.addIssue({ code: "custom", path: ["steps"], message: "Mission plan steps must not repeat." });
});
export type MissionPlan = z.infer<typeof missionPlanSchema>;

export const companyEvidenceSchema = z.object({
  type: z.enum(["WEBSITE", "NEWS", "CAREERS", "PRODUCT_PAGE", "DOCUMENT", "TRADE_SHOW"]),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(1_000),
  quote: z.string().trim().min(1).max(2_000),
  sourceUrl: z.url(),
  observedAt: z.iso.datetime(),
  confidence: z.number().min(0).max(1),
}).strict();

export const companyResearchOutputSchema = z.object({
  companyName: z.string().trim().min(1).max(300),
  companyDomain: z.string().trim().min(1).max(255),
  summary: z.string().trim().min(1).max(2_000),
  evidence: z.array(companyEvidenceSchema).min(1).max(20),
  risks: z.array(z.string().trim().min(1).max(500)).max(10),
}).strict();
export type CompanyResearchOutput = z.infer<typeof companyResearchOutputSchema>;

export const salesSignalSchema = z.object({
  type: z.enum(["HIRING", "EXPANSION", "NEW_FACTORY", "NEW_PRODUCT", "TRADE_SHOW"]),
  summary: z.string().trim().min(1).max(1_000),
  confidence: z.number().min(0).max(1),
  evidenceUrls: z.array(z.url()).min(1).max(10),
}).strict();

export const salesSignalOutputSchema = z.object({
  signals: z.array(salesSignalSchema).min(1).max(20),
  summary: z.string().trim().min(1).max(1_000),
}).strict();
export type SalesSignalOutput = z.infer<typeof salesSignalOutputSchema>;

// This deliberately mirrors the semantic assessment returned beside the domain's
// deterministic qualification decision. It cannot introduce a status that the
// domain qualification rules would reject.
export const qualificationOutputSchema = z.object({
  score: z.number().min(0).max(100),
  status: z.enum(["STRONG_FIT", "POTENTIAL_FIT", "REVIEW", "LOW_FIT", "DISQUALIFIED"]),
  reasons: z.array(z.string().trim().min(1).max(500)).max(12),
  risks: z.array(z.string().trim().min(1).max(500)).max(12),
  evidenceIds: z.array(z.string().trim().min(1)).max(50),
  confidence: z.number().min(0).max(1),
}).strict().superRefine((output, context) => {
  const expectedStatus = output.score >= 80 ? "STRONG_FIT" : output.score >= 60 ? "POTENTIAL_FIT" : output.score >= 40 ? "REVIEW" : "LOW_FIT";
  if (output.status === "DISQUALIFIED" && output.score !== 0) {
    context.addIssue({ code: "custom", path: ["status"], message: "DISQUALIFIED output must have a score of 0, as required by the deterministic hard-exclusion rule." });
  } else if (output.status !== "DISQUALIFIED" && output.status !== expectedStatus) {
    context.addIssue({ code: "custom", path: ["status"], message: `Status must match the existing weighted qualification score (${expectedStatus}).` });
  }
});
export type QualificationOutput = z.infer<typeof qualificationOutputSchema>;

export const prohibitedOutreachClaims = [
  "guaranteed", "guarantee", "best-in-class", "100% accurate", "zero defects", "risk-free", "unlimited",
] as const;

export const outreachDraftSchema = z.object({
  subjectVariants: z.array(z.string().trim().min(1).max(180)).min(1).max(3),
  selectedSubject: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(4_000),
  personalizationReason: z.string().trim().min(1).max(500),
  claimsUsed: z.array(z.string().trim().min(1).max(500)).max(20),
  evidenceIds: z.array(z.string().trim().min(1)).min(1).max(50),
  evidenceUrls: z.array(z.url()).min(1).max(20),
  riskFlags: z.array(z.string().trim().min(1).max(500)).max(20),
}).strict();
export type OutreachDraft = z.infer<typeof outreachDraftSchema>;

// Retain the established operation name for workflows while exposing the richer
// contract under its domain-specific name.
export const messageOutputSchema = outreachDraftSchema;

export const replyClassificationOutputSchema = z.object({
  classification: z.enum(["POSITIVE", "QUESTION", "REFERRAL", "NOT_NOW", "NOT_INTERESTED", "OUT_OF_OFFICE", "UNSUBSCRIBE", "BOUNCE", "SPAM_COMPLAINT", "UNKNOWN"]),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).min(1),
});
export const conversationSummaryOutputSchema = z.object({ summary: z.string().min(1), intent: z.string().min(1), objections: z.array(z.string()), questions: z.array(z.string()), commitments: z.array(z.string()), sourceMessageIds: z.array(z.string()).min(1) });
export const memoryOutputSchema = z.object({ facts: z.array(z.object({ category: z.string().min(1), fact: z.string().min(1), confidence: z.number().min(0).max(1), sourceMessageId: z.string().min(1) })) });
export const nextActionOutputSchema = z.object({ type: z.string().min(1), title: z.string().min(1), rationale: z.string().min(1), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]), dueInHours: z.number().int().nonnegative(), sourceMessageId: z.string().min(1) });
export const replyDraftOutputSchema = z.object({ subject: z.string().min(1), body: z.string().min(1), claimsUsed: z.array(z.string()), evidenceIds: z.array(z.string()), requiresApproval: z.boolean(), riskFlags: z.array(z.string()) });

export type ContractOperation = "mission-plan" | "company-research" | "signal-extraction" | "qualification" | "message";

export const operationInstructions: Record<ContractOperation, string> = {
  "mission-plan": "Create a bounded mission plan. Use only the allowed mission types and steps. Keep every action observable and require approval before outreach.",
  "company-research": "Research only supplied public company context. Separate directly quoted evidence from inference and attach a source URL to every quote.",
  "signal-extraction": "Extract timely sales signals only when supported by public evidence URLs. Do not invent urgency, funding, performance, or customer claims.",
  qualification: "Assess semantic fit using supplied evidence only. Deterministic hard rules and the weighted domain qualification remain authoritative.",
  message: "Draft concise, evidence-backed B2B outreach. Include a cited evidence URL and avoid guarantees, superlatives, or unsupported performance claims.",
};

export function buildOperationInstruction(operation: ContractOperation, additionalContext?: string) {
  return [operationInstructions[operation], additionalContext?.trim()].filter(Boolean).join("\n\n");
}

export type OutputValidation = { valid: boolean; errors: string[] };

export function validateCompanyResearchOutput(output: CompanyResearchOutput): OutputValidation {
  const errors = output.evidence.flatMap((evidence, index) => evidence.quote.trim() && !evidence.sourceUrl.trim() ? [`evidence.${index}.sourceUrl is required when quote is present.`] : []);
  return { valid: errors.length === 0, errors };
}

export function validateSalesSignalOutput(output: SalesSignalOutput): OutputValidation {
  const errors = output.signals.flatMap((signal, index) => signal.evidenceUrls.length ? [] : [`signals.${index}.evidenceUrls must contain at least one URL.`]);
  return { valid: errors.length === 0, errors };
}

function englishWordCount(value: string) {
  return value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)?/g)?.length ?? 0;
}

function escapedPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateOutreachDraft(output: OutreachDraft, prohibitedClaims: readonly string[] = prohibitedOutreachClaims): OutputValidation {
  const errors: string[] = [];
  if (englishWordCount(output.body) > 180) errors.push("body must contain at most 180 English words.");
  if (!output.evidenceUrls.some((url) => output.body.includes(url))) errors.push("body must include at least one evidence URL from evidenceUrls.");
  const prohibited = prohibitedClaims.filter((claim) => new RegExp(`\\b${escapedPattern(claim)}\\b`, "i").test(output.body));
  if (prohibited.length) errors.push(`body contains prohibited claims: ${prohibited.join(", ")}.`);
  return { valid: errors.length === 0, errors };
}

export function validateOperationOutput(operation: string, output: unknown): OutputValidation {
  if (operation === "company-research") {
    const parsed = companyResearchOutputSchema.safeParse(output);
    return parsed.success ? validateCompanyResearchOutput(parsed.data) : { valid: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  if (operation === "signal-extraction") {
    const parsed = salesSignalOutputSchema.safeParse(output);
    return parsed.success ? validateSalesSignalOutput(parsed.data) : { valid: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  if (operation === "message") {
    const parsed = outreachDraftSchema.safeParse(output);
    return parsed.success ? validateOutreachDraft(parsed.data) : { valid: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  return { valid: true, errors: [] };
}

function assertOperationOutput(operation: string, output: unknown) {
  const validation = validateOperationOutput(operation, output);
  if (!validation.valid) throw new Error(`AI_OUTPUT_VALIDATION_ERROR: ${operation}: ${validation.errors.join("; ")}`);
}

export class MockAIProvider implements AIProvider {
  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const started = Date.now();
    const fixture = mockFixture(request.operation, request.input);
    assertOperationOutput(request.operation, fixture);
    return { data: request.outputSchema.parse(fixture), provider: "mock-ai", model: "deterministic-v1", inputTokens: 420, outputTokens: 180, latencyMs: Date.now() - started, estimatedCost: 0 };
  }
}

export class DeepSeekAIProvider implements AIProvider {
  readonly model: string;
  readonly baseUrl: string;

  constructor(private readonly apiKey: string, options?: { model?: string; baseUrl?: string }) {
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required for the DeepSeek provider.");
    this.model = options?.model ?? "deepseek-chat";
    this.baseUrl = (options?.baseUrl ?? "https://api.deepseek.com").replace(/\/$/, "");
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const started = Date.now();
    let correction = "";
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 30_000);
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.model,
            temperature: request.temperature ?? 0.2,
            max_tokens: request.maxTokens ?? 1400,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: `${request.systemInstruction}\nReturn only a valid JSON object. Do not reveal hidden reasoning. ${correction}` },
              { role: "user", content: JSON.stringify(request.input) },
            ],
          }),
        });
        if (!response.ok) throw new Error(`DeepSeek request failed with status ${response.status}.`);
        const payload = await response.json() as { id?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const raw = payload.choices?.[0]?.message?.content;
        if (!raw) throw new Error("DeepSeek returned no structured content.");
        const parsed = request.outputSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          lastError = parsed.error;
          correction = `The previous JSON failed schema validation: ${parsed.error.issues.slice(0, 4).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}. Correct these fields.`;
          continue;
        }
        const postValidation = validateOperationOutput(request.operation, parsed.data);
        if (!postValidation.valid) {
          lastError = new Error(postValidation.errors.join("; "));
          correction = `The previous JSON failed required output validation: ${postValidation.errors.slice(0, 4).join("; ")}. Correct these fields.`;
          continue;
        }
        return { data: parsed.data, provider: "deepseek", model: this.model, inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0, latencyMs: Date.now() - started, estimatedCost: 0, requestId: payload.id };
      } catch (error) {
        lastError = error;
        correction = "The previous response was not valid JSON or could not be processed. Return only a JSON object matching the requested schema.";
      } finally {
        clearTimeout(timeout);
      }
    }
    const message = lastError instanceof Error ? lastError.message : "Unknown structured-output error";
    throw new Error(`AI_STRUCTURED_GENERATION_FAILED: ${request.operation} failed after 2 attempts: ${message}`);
  }
}

export function getAIProvider(): AIProvider {
  for (const path of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) loadDotenv({ path, override: false, quiet: true });
  if (process.env.AI_PROVIDER === "deepseek") return new DeepSeekAIProvider(process.env.DEEPSEEK_API_KEY ?? "", { baseUrl: process.env.DEEPSEEK_BASE_URL, model: process.env.DEEPSEEK_MODEL });
  return new MockAIProvider();
}

function requestedMissionType(record: Record<string, unknown>): MissionType {
  const candidate = record.missionType ?? record.type;
  const parsed = missionTypeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "EXPANSION_SIGNAL_OUTREACH";
}

function inputStrings(value: unknown, fallback: string[]) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim()) ? value as string[] : fallback;
}

function mockFixture(operation: string, input: unknown): unknown {
  const record = (input ?? {}) as Record<string, unknown>;
  const sourceUrl = inputStrings(record.evidenceUrls, ["https://nova-automation.example/demo-source-4"])[0]!;
  const evidenceIds = inputStrings(record.evidenceIds, ["demo-evidence"]);
  if (operation === "mission-plan") return {
    missionType: requestedMissionType(record),
    objective: String(record.objective ?? "Identify high-fit manufacturers and prepare evidence-backed outreach."),
    summary: "A controlled Nova Automation mission using fictional seed-account evidence.",
    steps: [
      { step: "LOAD_KNOWLEDGE", objective: "Load approved Nova Automation knowledge.", expectedOutput: "Approved claims and ICP context" },
      { step: "LOAD_ACCOUNT", objective: "Load the selected fictional seed account.", expectedOutput: "Account profile" },
      { step: "RESEARCH_WEBSITE", objective: "Review public company pages.", expectedOutput: "Quoted website evidence" },
      { step: "EXTRACT_SIGNALS", objective: "Extract timely buying signals.", expectedOutput: "Evidence-linked signals" },
      { step: "QUALIFY_ACCOUNT", objective: "Apply deterministic qualification.", expectedOutput: "Fit decision" },
      { step: "GENERATE_OUTREACH", objective: "Prepare approval-ready outreach.", expectedOutput: "Evidence-backed draft" },
    ],
    guardrails: ["Use public evidence only.", "Require human approval before outbound delivery."],
  };
  if (operation === "company-research") return {
    companyName: String(record.companyName ?? record.accountName ?? "Nova Automation"),
    companyDomain: String(record.companyDomain ?? record.domain ?? "nova-automation.example"),
    summary: "The fictional seed account operates multi-line manufacturing and is evaluating automation capacity.",
    evidence: [{ type: "WEBSITE", title: "Factory footprint", summary: "The company page describes multi-line manufacturing operations.", quote: "Operations include three manufacturing halls.", sourceUrl, observedAt: "2026-07-01T00:00:00.000Z", confidence: 0.91 }],
    risks: [],
  };
  if (operation === "signal-extraction") return {
    signals: [{ type: "EXPANSION", summary: "A fictional demo announcement describes a planned production expansion.", confidence: 0.82, evidenceUrls: [sourceUrl] }],
    summary: "One evidence-linked expansion signal was found.",
  };
  if (operation === "qualification") return { score: 84, status: "STRONG_FIT", reasons: ["Target industry and manufacturing footprint match"], risks: [], evidenceIds, confidence: 0.87 };
  if (operation === "message") return {
    subjectVariants: ["A question about inline inspection", "Vision inspection for one production station"],
    selectedSubject: "A question about inline inspection",
    body: `Hi {{firstName}},\n\nI noticed the public expansion update for your production team: ${sourceUrl}\n\nWould it be useful to compare how inline vision inspection could fit one station?\n\nBest,\nNova Automation`,
    personalizationReason: "Uses a cited fictional public expansion signal.",
    claimsUsed: ["Compatible with common industrial camera interfaces."],
    evidenceIds,
    evidenceUrls: [sourceUrl],
    riskFlags: [],
  };
  if (operation === "reply-classification") return { classification: "QUESTION", confidence: 0.91, reasons: ["The inbound message contains a direct technical question."] };
  if (operation === "conversation-summary") return { summary: "The contact asked for validated technical details.", intent: "QUESTION", objections: [], questions: ["What line speed is supported?"], commitments: [], sourceMessageIds: inputStrings(record.sourceMessageIds, ["demo-message"]) };
  if (operation === "memory") return { facts: [{ category: "QUESTION", fact: "Needs validated line-speed information", confidence: 0.9, sourceMessageId: String(record.messageId ?? "demo-message") }] };
  if (operation === "next-action") return { type: "DRAFT_ANSWER", title: "Draft an evidence-backed answer", rationale: "The contact asked a technical question.", priority: "HIGH", dueInHours: 4, sourceMessageId: String(record.messageId ?? "demo-message") };
  if (operation === "reply-draft") return { subject: "Re: inline inspection", body: "Thanks for the question. I’ll share the validated configuration range for your review.", claimsUsed: [], evidenceIds, requiresApproval: true, riskFlags: [] };
  return record;
}
