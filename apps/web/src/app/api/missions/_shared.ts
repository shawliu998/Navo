import { z } from "zod";
import type { MissionPlan } from "@navo/agents";

export const missionInputSchema = z.object({
  name: z.string().trim().min(3).max(160),
  type: z.string().trim().min(2).max(80).optional(),
  objective: z.string().trim().min(8).max(2_000),
  desiredOutcome: z.string().trim().max(1_000).optional(),
  status: z.enum(["DRAFT", "PLANNING", "READY", "RUNNING", "ACTIVE"]).optional(),
  operatingMode: z.enum(["OBSERVE", "RECOMMEND", "APPROVAL_CONTROLLED"]).optional(),
  playId: z.string().uuid().optional(),
  inputSource: z.string().trim().max(80).optional(),
  approvalPolicy: z.string().trim().max(80).optional(),
  accountIds: z.array(z.string().uuid()).max(100).optional(),
  targetCount: z.number().int().min(0).max(1_000).optional(),
  maximumAccounts: z.number().int().min(1).max(1_000).optional(),
  estimatedCostLimit: z.number().min(0).max(10_000).optional(),
  testMode: z.boolean().optional(),
  dueAt: z.string().datetime().optional(),
  targetCriteria: z.record(z.string(), z.unknown()).optional(),
  stopConditions: z.array(z.unknown()).max(20).optional(),
  targetAccountId: z.string().uuid().optional(),
});

export const missionPatchSchema = missionInputSchema.pick({
  name: true,
  objective: true,
  desiredOutcome: true,
  operatingMode: true,
  approvalPolicy: true,
  dueAt: true,
  targetCriteria: true,
  stopConditions: true,
}).partial().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000002";

export function deterministicCommandProposal(command: string) {
  const normalized = command.toLowerCase();
  const replyFollowUp = /reply|回复|follow.?up|跟进/.test(normalized);
  const tradeShow = /trade.?show|展会/.test(normalized);
  const distributor = /distributor|经销商/.test(normalized);
  const missionType = replyFollowUp
    ? "REPLY_FOLLOW_UP"
    : tradeShow
      ? "TRADE_SHOW_LIST_QUALIFICATION"
      : distributor
        ? "DISTRIBUTOR_SEARCH"
        : "EXPANSION_SIGNAL_OUTREACH";
  const name = replyFollowUp
    ? "Summarize recent replies and prepare follow-up"
    : tradeShow
      ? "Qualify trade show target accounts"
      : distributor
        ? "Find qualified distributor candidates"
        : "Find high-fit accounts with expansion signals";
  const targetCountMatch = command.match(/(\d{1,3})/);
  const estimatedAccounts = Math.min(Number(targetCountMatch?.[1] ?? 20), 100);
  const planSteps = replyFollowUp
    ? ["Load recent conversations", "Classify replies", "Summarize conversations", "Update account memory", "Propose next actions", "Create follow-up tasks"]
    : ["Load product and ICP context", "Select target accounts", "Research company websites", "Extract buying signals", "Qualify accounts", "Generate evidence-backed drafts", "Request approval"];
  return {
    name,
    objective: command,
    missionType,
    targetScope: replyFollowUp ? "Recent EmailSink conversations" : "Demo accounts matching the selected ICP",
    inputSource: replyFollowUp ? "REPLIES" : tradeShow ? "TRADE_SHOW_LIST" : "DEMO_ACCOUNTS",
    recommendedPlaybook: replyFollowUp ? "Reply Follow-up" : "Target Account Outreach with Policy Check",
    planSteps,
    expectedOutputs: replyFollowUp ? ["Conversation summaries", "Account memory", "Follow-up tasks"] : ["Evidence-backed findings", "Qualified accounts", "Approval-ready drafts"],
    estimatedAccounts,
    estimatedCost: Number((estimatedAccounts * 0.004).toFixed(3)),
    riskLevel: "LOW",
    approvalRequirements: ["Human approval is required before any outbound action", "EmailSink test mode only"],
    operatingMode: "APPROVAL_CONTROLLED" as const,
    testMode: true,
    deterministic: true,
  };
}

export function missionPlanProposal(plan: MissionPlan) {
  return {
    name: plan.name,
    objective: plan.objective,
    missionType: plan.missionType,
    targetScope: plan.targetDescription,
    inputSource: "DEMO_ACCOUNTS",
    recommendedPlaybook: "Target Account Outreach with Policy Check",
    planSteps: plan.steps.map((step) => step.title),
    expectedOutputs: plan.expectedOutputs,
    estimatedAccounts: 1,
    estimatedCost: 0.004,
    riskLevel: "LOW",
    approvalRequirements: ["This mission saves a DRAFT only and never sends email."],
    operatingMode: "RECOMMEND" as const,
    testMode: true,
    deterministic: false,
    assumptions: plan.assumptions,
    plan,
  };
}
