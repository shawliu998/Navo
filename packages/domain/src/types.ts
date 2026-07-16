import { z } from "zod";

export const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "OPERATOR", "REVIEWER", "VIEWER"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const qualificationSchema = z.enum([
  "NOT_RESEARCHED", "STRONG_FIT", "POTENTIAL_FIT", "REVIEW", "LOW_FIT", "DISQUALIFIED",
]);
export type AccountQualification = z.infer<typeof qualificationSchema>;

export const evidenceSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  accountId: z.string().min(1),
  type: z.enum(["WEBSITE", "NEWS", "CAREERS", "PRODUCT_PAGE", "DOCUMENT", "USER_INPUT", "MANUAL", "CRM", "TRADE_SHOW"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  quote: z.string().optional(),
  sourceUrl: z.url().optional(),
  sourceDocumentId: z.string().optional(),
  observedAt: z.iso.datetime(),
  fetchedAt: z.iso.datetime(),
  confidence: z.number().min(0).max(1),
  contentHash: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const inferenceSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  accountId: z.string().min(1),
  statement: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  agentVersion: z.string().min(1),
  createdAt: z.iso.datetime(),
});
export type Inference = z.infer<typeof inferenceSchema>;

export const decisionSchema = z.object({
  decisionType: z.string().min(1),
  result: z.string().min(1),
  rulesApplied: z.array(z.string()),
  scoreBreakdown: z.record(z.string(), z.number()),
  evidenceIds: z.array(z.string()),
  inferenceIds: z.array(z.string()),
  explanation: z.string().min(1),
});
export type Decision = z.infer<typeof decisionSchema>;

export const playNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.unknown()).default({}),
});
export const playEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  branch: z.string().optional(),
});
export type PlayNode = z.infer<typeof playNodeSchema>;
export type PlayEdge = z.infer<typeof playEdgeSchema>;
