import { describe, expect, it } from "vitest";
import { deriveCompletionBrief } from "../src/lib/mission-completion-brief";
import { missionActualCostLabel } from "../src/lib/mission-cost";
import { canEditDraftMessage, draftMessagePatchSchema, matchesDraftRevision, preserveOriginalDraft } from "../src/lib/draft-message";
import { followUpTaskDescription, followUpTaskTitle } from "../src/lib/mission-follow-through";

describe("completion brief", () => {
  it("is honest when a completed mission has no persisted output", () => {
    const brief = deriveCompletionBrief({ status: "COMPLETED", error: null, result: {}, account: { id: "account-1", name: "Acme" }, evidence: [], signals: [], qualification: null, message: null });
    expect(brief).toMatchObject({ state: "empty", score: null, evidenceCount: 0 });
    expect(brief.findings).toEqual([]);
  });

  it("uses persisted qualification, evidence, signals, risks, and DRAFT subject", () => {
    const brief = deriveCompletionBrief({ status: "COMPLETED", error: null, result: { research: { manufacturingSignals: ["New production line"] } }, account: { id: "account-1", name: "Acme" }, evidence: [{ sourceUrl: "https://acme.example/news" }, { sourceUrl: "https://acme.example/news" }], signals: [{ summary: "Hiring automation engineers" }], qualification: { score: 82, status: "STRONG_FIT", risks: ["Timing is unconfirmed"] }, message: { id: "message-1", subject: "A safer inspection workflow", status: "DRAFT" } });
    expect(brief).toMatchObject({ state: "completed", qualified: true, score: 82, evidenceCount: 2, draftSubject: "A safer inspection workflow" });
    expect(brief.findings).toContain("Hiring automation engineers");
  });

  it("marks REVIEW as needs review and never treats Mock zero as measured cost", () => {
    const brief = deriveCompletionBrief({ status: "COMPLETED", error: null, result: {}, account: { id: "account-1", name: "Acme" }, evidence: [], signals: [], qualification: { score: 55, status: "REVIEW", risks: [] }, message: null });
    expect(brief).toMatchObject({ qualified: false, qualificationStatus: "REVIEW" });
    expect(brief.conclusion).toContain("needs review");
    expect(missionActualCostLabel()).toBe("Not measured");
  });
});

describe("draft and follow-up guards", () => {
  it("only permits non-empty outbound DRAFT edits", () => {
    expect(canEditDraftMessage({ direction: "OUTBOUND", status: "DRAFT" })).toBe(true);
    expect(canEditDraftMessage({ direction: "OUTBOUND", status: "SENT" })).toBe(false);
    expect(draftMessagePatchSchema.safeParse({ subject: " ", body: "Body" }).success).toBe(false);
    expect(draftMessagePatchSchema.safeParse({ subject: "Subject", body: "x".repeat(4_001) }).success).toBe(false);
    expect(matchesDraftRevision(1, 1)).toBe(true);
    expect(matchesDraftRevision(1, 2)).toBe(false);
    expect(preserveOriginalDraft("Original", "Edited")).toBe("Original");
    expect(preserveOriginalDraft(null, "First draft")).toBe("First draft");
  });

  it("uses a stable Mission marker for idempotent follow-up tasks", () => {
    expect(followUpTaskTitle("Research Acme")).toBe("Mission follow-up: Research Acme");
    expect(followUpTaskDescription("mission-1", "Research Acme")).toContain("Mission mission-1");
  });
});
