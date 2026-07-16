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
export type StructuredGenerationResult<T> = { data: T; provider: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number; estimatedCost: number; requestId?: string };
export interface AIProvider { generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>>; }

export class MockAIProvider implements AIProvider {
  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const started = Date.now();
    const fixture = mockFixture(request.operation, request.input);
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
        if (!response.ok) throw new Error(`DeepSeek request failed with status ${response.status}`);
        const payload = await response.json() as { id?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const raw = payload.choices?.[0]?.message?.content;
        if (!raw) throw new Error("DeepSeek returned no structured content.");
        const parsed = request.outputSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          lastError = parsed.error;
          correction = `The previous JSON failed validation: ${parsed.error.issues.slice(0, 4).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}. Correct these fields.`;
          continue;
        }
        return { data: parsed.data, provider: "deepseek", model: this.model, inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0, latencyMs: Date.now() - started, estimatedCost: 0, requestId: payload.id };
      } catch (error) { lastError = error; }
      finally { clearTimeout(timeout); }
    }
    const message = lastError instanceof Error ? lastError.message : "Unknown schema validation error";
    throw new Error(`AI_SCHEMA_VALIDATION_ERROR: ${message}`);
  }
}

export function getAIProvider(): AIProvider {
  for (const path of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) loadDotenv({ path, override: false, quiet: true });
  if (process.env.AI_PROVIDER === "deepseek") return new DeepSeekAIProvider(process.env.DEEPSEEK_API_KEY ?? "", { baseUrl: process.env.DEEPSEEK_BASE_URL, model: process.env.DEEPSEEK_MODEL });
  return new MockAIProvider();
}

export const qualificationOutputSchema = z.object({ score: z.number().min(0).max(100), status: z.enum(["STRONG_FIT", "POTENTIAL_FIT", "REVIEW", "LOW_FIT", "DISQUALIFIED"]), reasons: z.array(z.string()), risks: z.array(z.string()), evidenceIds: z.array(z.string()), confidence: z.number().min(0).max(1) });
export const messageOutputSchema = z.object({ subjectVariants: z.array(z.string()).min(1).max(3), selectedSubject: z.string(), body: z.string(), personalizationReason: z.string(), claimsUsed: z.array(z.string()), evidenceIds: z.array(z.string()).min(1), riskFlags: z.array(z.string()) });
export const replyClassificationOutputSchema = z.object({ classification: z.enum(["POSITIVE", "QUESTION", "REFERRAL", "NOT_NOW", "NOT_INTERESTED", "OUT_OF_OFFICE", "UNSUBSCRIBE", "BOUNCE", "SPAM_COMPLAINT", "UNKNOWN"]), confidence: z.number().min(0).max(1), reasons: z.array(z.string()).min(1) });
export const conversationSummaryOutputSchema = z.object({ summary: z.string().min(1), intent: z.string().min(1), objections: z.array(z.string()), questions: z.array(z.string()), commitments: z.array(z.string()), sourceMessageIds: z.array(z.string()).min(1) });
export const memoryOutputSchema = z.object({ facts: z.array(z.object({ category: z.string().min(1), fact: z.string().min(1), confidence: z.number().min(0).max(1), sourceMessageId: z.string().min(1) })) });
export const nextActionOutputSchema = z.object({ type: z.string().min(1), title: z.string().min(1), rationale: z.string().min(1), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]), dueInHours: z.number().int().nonnegative(), sourceMessageId: z.string().min(1) });
export const replyDraftOutputSchema = z.object({ subject: z.string().min(1), body: z.string().min(1), claimsUsed: z.array(z.string()), evidenceIds: z.array(z.string()), requiresApproval: z.boolean(), riskFlags: z.array(z.string()) });

function mockFixture(operation: string, input: unknown): unknown {
  const record = (input ?? {}) as Record<string, unknown>;
  if (operation === "qualification") return { score: 84, status: "STRONG_FIT", reasons: ["Target industry and manufacturing footprint match"], risks: [], evidenceIds: Array.isArray(record.evidenceIds) ? record.evidenceIds : ["demo-evidence"], confidence: .87 };
  if (operation === "message") return { subjectVariants: ["A question about inline inspection", "Vision inspection for one production station"], selectedSubject: "A question about inline inspection", body: "Hi {{firstName}},\n\nI noticed your team is expanding automated production. Would it be useful to compare how inline vision inspection could fit one station?\n\nBest,\nNova Automation", personalizationReason: "Uses a cited public expansion signal.", claimsUsed: ["Compatible with common industrial camera interfaces."], evidenceIds: Array.isArray(record.evidenceIds) ? record.evidenceIds : ["demo-evidence"], riskFlags: [] };
  if (operation === "reply-classification") return { classification: "QUESTION", confidence: .91, reasons: ["The inbound message contains a direct technical question."] };
  if (operation === "conversation-summary") return { summary: "The contact asked for validated technical details.", intent: "QUESTION", objections: [], questions: ["What line speed is supported?"], commitments: [], sourceMessageIds: Array.isArray(record.sourceMessageIds) ? record.sourceMessageIds : ["demo-message"] };
  if (operation === "memory") return { facts: [{ category: "QUESTION", fact: "Needs validated line-speed information", confidence: .9, sourceMessageId: String(record.messageId ?? "demo-message") }] };
  if (operation === "next-action") return { type: "DRAFT_ANSWER", title: "Draft an evidence-backed answer", rationale: "The contact asked a technical question.", priority: "HIGH", dueInHours: 4, sourceMessageId: String(record.messageId ?? "demo-message") };
  if (operation === "reply-draft") return { subject: "Re: inline inspection", body: "Thanks for the question. I’ll share the validated configuration range for your review.", claimsUsed: [], evidenceIds: Array.isArray(record.evidenceIds) ? record.evidenceIds : [], requiresApproval: true, riskFlags: [] };
  return record;
}
