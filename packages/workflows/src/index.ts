import { z } from "zod";
import type { AIProvider } from "@navo/agents";
import { messageOutputSchema, qualificationOutputSchema, replyDraftOutputSchema } from "@navo/agents";
import { classifyReply, deriveMemoryFacts, evaluateSendPolicy, proposeNextBestAction, qualifyAccount, redactSensitive, summarizeConversation } from "@navo/domain";

export type NodeDefinition = { type: string; category: string; label: string; description: string; inputPorts: string[]; outputPorts: string[]; configurationSchema: z.ZodType; runtimeInputSchema: z.ZodType; runtimeOutputSchema: z.ZodType };
const anyInput = z.record(z.string(), z.unknown());
const anyOutput = z.record(z.string(), z.unknown());
const def = (type: string, category: string, label: string, outputPorts = ["next"], configurationSchema: z.ZodType = z.object({})) : NodeDefinition => ({ type, category, label, description: label, inputPorts: type.includes("Trigger") ? [] : ["input"], outputPorts, configurationSchema, runtimeInputSchema: anyInput, runtimeOutputSchema: anyOutput });

export const nodeRegistry: NodeDefinition[] = [
  def("manualTrigger", "Triggers", "Manual Trigger"), def("csvImportTrigger", "Triggers", "CSV Import Trigger"), def("accountMatchesFilter", "Triggers", "Account Matches Filter", ["matched"]),
  def("researchCompany", "Research", "Research Company", ["researched"], z.object({ maxPages: z.number().min(1).max(20).default(8), language: z.string().default("en") })), def("extractSignals", "Research", "Extract Signals"),
  def("qualifyAccount", "Decision", "Qualify Account", ["Qualified", "Review", "Not Qualified"], z.object({ minimumScore: z.number().min(0).max(100).default(60) })), def("conditionBranch", "Decision", "Condition Branch", ["yes", "no"]),
  def("findContacts", "Prospecting", "Find Contacts"), def("selectPersona", "Prospecting", "Select Persona"), def("loopContacts", "Prospecting", "Loop Contacts", ["each", "done"], z.object({ maxIterations: z.number().min(1).max(20).default(5) })),
  def("generateMessage", "Content", "Generate Message", ["draft"], z.object({ approvedClaimsOnly: z.boolean().default(true), tone: z.string().default("concise") })),
  def("generateReplyDraft", "Content", "Generate Reply Draft", ["draft"], z.object({ approvedClaimsOnly: z.boolean().default(true) })),
  def("humanApproval", "Human", "Human Approval", ["Approved", "Rejected", "Changes Requested"]), def("manualTask", "Human", "Manual Task"),
  def("enrollSequence", "Engagement", "Enroll In Sequence", ["enrolled", "blocked"], z.object({ testMode: z.boolean().default(true) })), def("sendTestEmail", "Engagement", "Send Test Email", ["sent", "blocked"], z.object({ testMode: z.literal(true) })),
  def("replyReceivedTrigger", "Triggers", "Reply Received Trigger", ["received"]), def("loadAccountMemory", "Memory", "Load Account Memory", ["loaded"]),
  def("classifyReply", "Reply Intelligence", "Classify Reply", ["classified"]), def("summarizeConversation", "Reply Intelligence", "Summarize Conversation", ["summarized"]),
  def("updateMemory", "Memory", "Update Memory", ["updated"], z.object({ sourceRequired: z.boolean().default(true) })), def("proposeNextAction", "Decision", "Propose Next Action", ["Reply needed", "Human follow-up", "Suppress"]),
  def("policyCheck", "Guardrails", "Policy Check", ["Allowed", "Review", "Blocked"]),
  def("syncCrm", "CRM", "Sync CRM"), def("delay", "Utility", "Delay"), def("stop", "Utility", "Stop", []),
];
export const nodeRegistryByType = new Map(nodeRegistry.map((node) => [node.type, node]));

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
