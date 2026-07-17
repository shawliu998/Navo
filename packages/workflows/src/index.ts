import type { AIProvider } from "@navo/agents";
import { messageOutputSchema, qualificationOutputSchema, replyDraftOutputSchema } from "@navo/agents";
import { classifyReply, deriveMemoryFacts, evaluateSendPolicy, proposeNextBestAction, qualifyAccount, redactSensitive, summarizeConversation } from "@navo/domain";

export * from "./website-research/index";
export * from "./registry";
export * from "./tools/index";
export * from "./mission-executor";

export type ExecutorContext = { ai: AIProvider; workspaceId: string; runId: string; testMode: boolean };
export async function executeNode(type: string, input: Record<string, unknown>, config: Record<string, unknown>, context: ExecutorContext) {
  if (type === "qualifyAccount") {
    const base = qualifyAccount({ hardRules: Number(input.hardRules ?? 85), businessSignals: Number(input.businessSignals ?? 75), productMatch: Number(input.productMatch ?? 90), similarCaseMatch: Number(input.similarCaseMatch ?? 70), semanticJudgment: 50, hardExcluded: input.hardExcluded === true, evidenceIds: input.evidenceIds as string[] ?? [] });
    if (base.status === "DISQUALIFIED") return base;
    const semantic = await context.ai.generateStructured({ operation: "qualification", systemInstruction: "Assess semantic fit using only supplied evidence IDs. Hard rules are already decided by code.", input: { ...input, deterministicScore: base.score }, outputSchema: qualificationOutputSchema, promptVersion: "qualification-v1", maxTokens: 800 });
    return { ...base, semantic: semantic.data, usage: { provider: semantic.provider, model: semantic.model, tokens: semantic.inputTokens + semantic.outputTokens } };
  }
  if (type === "generateMessage") return (await context.ai.generateStructured({ operation: "message", systemInstruction: "Write concise B2B email JSON. Use only supplied evidence and approved claims.", input, outputSchema: messageOutputSchema, promptVersion: "message-v1", maxTokens: 1200 })).data;
  if (type === "generateReplyDraft") return (await context.ai.generateStructured({ operation: "reply-draft", systemInstruction: "Draft a concise reply using only approved claims and cited evidence. Do not send it.", input, outputSchema: replyDraftOutputSchema, promptVersion: "reply-draft-v1", maxTokens: 1000 })).data;
  if (type === "classifyReply") return classifyReply({ messageId: String(input.messageId ?? "runtime-message"), subject: String(input.subject ?? ""), body: String(input.body ?? ""), eventType: (input.eventType as "REPLY" | "BOUNCE" | "UNSUBSCRIBE" | "SPAM_COMPLAINT") ?? "REPLY" });
  if (type === "summarizeConversation") return summarizeConversation({ messages: input.messages as never, classification: input.classification as never });
  if (type === "updateMemory") return { facts: deriveMemoryFacts({ messageId: String(input.messageId), body: String(input.body ?? ""), classification: input.classification as never, confidence: Number(input.confidence ?? .5), observedAt: String(input.observedAt ?? new Date().toISOString()) }) };
  if (type === "proposeNextAction") return proposeNextBestAction({ messageId: String(input.messageId), classification: input.classification as never });
  if (type === "policyCheck") { const policy = evaluateSendPolicy(input as never); return { ...policy, branch: policy.allowed ? "Allowed" : "Blocked" }; }
  if (type === "enrollSequence" || type === "sendTestEmail") {
    const policy = evaluateSendPolicy(input as never);
    return policy.allowed ? { status: "QUEUED_TO_EMAIL_SINK", test: true } : { status: "BLOCKED", reasons: policy.reasons };
  }
  if (type === "humanApproval") return { status: "WAITING", proposal: redactSensitive(input) };
  return { ...input, nodeType: type, executedBy: "deterministic-runtime" };
}
