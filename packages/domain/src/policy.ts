export type SendPolicyInput = {
  role: string;
  contactSuppressed: boolean;
  accountSuppressed: boolean;
  emailVerified: boolean;
  approvalStatus: string;
  unapprovedClaims: string[];
  evidenceIds: string[];
  idempotencyKey?: string;
  testMode: boolean;
  recipient: string;
  allowlist: string[];
};

export function evaluateSendPolicy(input: SendPolicyInput) {
  const reasons: string[] = [];
  if (!new Set(["OWNER", "ADMIN", "OPERATOR"]).has(input.role)) reasons.push("ROLE_NOT_ALLOWED");
  if (input.contactSuppressed || input.accountSuppressed) reasons.push("SUPPRESSED");
  if (!input.emailVerified) reasons.push("EMAIL_NOT_VERIFIED");
  if (!new Set(["APPROVED", "APPROVED_WITH_CHANGES"]).has(input.approvalStatus)) reasons.push("APPROVAL_REQUIRED");
  if (input.unapprovedClaims.length) reasons.push("UNAPPROVED_CLAIMS");
  if (!input.evidenceIds.length) reasons.push("EVIDENCE_REQUIRED");
  if (!input.idempotencyKey) reasons.push("IDEMPOTENCY_REQUIRED");
  if (input.testMode && !input.allowlist.includes(input.recipient)) reasons.push("RECIPIENT_NOT_ALLOWLISTED");
  return { allowed: reasons.length === 0, reasons };
}

const secretPattern = /(api[-_]?key|token|password|authorization|secret)/i;
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, secretPattern.test(key) ? "[REDACTED]" : redactSensitive(nested)]));
  return value;
}
