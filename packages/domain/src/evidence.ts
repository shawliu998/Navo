import { inferenceSchema, type Evidence, type Inference } from "./types";

export function validateInference(inference: Inference, availableEvidence: Evidence[]) {
  const parsed = inferenceSchema.safeParse(inference);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map((issue) => issue.message) };
  const available = new Set(availableEvidence.filter((item) => item.workspaceId === inference.workspaceId && item.accountId === inference.accountId).map((item) => item.id));
  const missing = inference.evidenceIds.filter((id) => !available.has(id));
  return missing.length ? { valid: false, errors: [`Missing or cross-tenant evidence: ${missing.join(", ")}`] } : { valid: true, errors: [] };
}

export function validateMessageClaims(claims: string[], approvedClaims: string[]) {
  const approved = new Set(approvedClaims.map((claim) => claim.trim().toLocaleLowerCase()));
  const unapproved = claims.filter((claim) => !approved.has(claim.trim().toLocaleLowerCase()));
  return { valid: unapproved.length === 0, unapproved };
}
