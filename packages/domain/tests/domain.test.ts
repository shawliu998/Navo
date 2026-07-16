import { describe, expect, it } from "vitest";
import { can, dedupeAccountKey, evaluateSendPolicy, qualifyAccount, redactSensitive, validateInference, validatePlay } from "../src";

describe("qualification", () => {
  it("scores by fixed weights", () => expect(qualifyAccount({ hardRules: 90, businessSignals: 80, productMatch: 90, similarCaseMatch: 70, semanticJudgment: 80, evidenceIds: ["e1"] })).toMatchObject({ score: 85, status: "STRONG_FIT" }));
  it("never lets semantics override hard exclusions", () => expect(qualifyAccount({ hardRules: 100, businessSignals: 100, productMatch: 100, similarCaseMatch: 100, semanticJudgment: 100, hardExcluded: true, evidenceIds: [] }).status).toBe("DISQUALIFIED"));
});

describe("evidence boundaries", () => {
  it("rejects cross-workspace references", () => {
    const inference = { id: "i", workspaceId: "w1", accountId: "a", statement: "Needs inspection", evidenceIds: ["e"], confidence: .8, agentVersion: "1", createdAt: new Date().toISOString() };
    const evidence = [{ id: "e", workspaceId: "w2", accountId: "a", type: "WEBSITE" as const, title: "Factory", summary: "Factory page", observedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), confidence: .9, metadata: {} }];
    expect(validateInference(inference, evidence).valid).toBe(false);
  });
});

describe("play publishing", () => {
  it("requires trigger and approval before production sending", () => {
    const issues = validatePlay([{ id: "send", type: "enrollSequence", label: "Send", position: { x: 0, y: 0 }, config: {} }], []);
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["TRIGGER_REQUIRED", "APPROVAL_REQUIRED"]));
  });
});

describe("outbound safety", () => {
  it("blocks suppression before provider invocation", () => expect(evaluateSendPolicy({ role: "OPERATOR", contactSuppressed: true, accountSuppressed: false, emailVerified: true, approvalStatus: "APPROVED", unapprovedClaims: [], evidenceIds: ["e"], idempotencyKey: "k", testMode: true, recipient: "demo@navo.local", allowlist: ["demo@navo.local"] })).toMatchObject({ allowed: false, reasons: ["SUPPRESSED"] }));
  it("redacts nested credentials", () => expect(redactSensitive({ body: { apiKey: "secret" } })).toEqual({ body: { apiKey: "[REDACTED]" } }));
});

describe("access and imports", () => {
  it("keeps viewer read only", () => { expect(can("VIEWER", "data.view")).toBe(true); expect(can("VIEWER", "run.start")).toBe(false); });
  it("normalizes domains for dedupe", () => expect(dedupeAccountKey({ website: "https://www.Example.com/path", companyName: "X" })).toBe("domain:example.com"));
});
