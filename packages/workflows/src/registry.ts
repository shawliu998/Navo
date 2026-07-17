import { z } from "zod";

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
