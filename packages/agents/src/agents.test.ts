import { describe, expect, it } from "vitest";
import {
  MockAIProvider,
  companyResearchOutputSchema,
  conversationSummaryOutputSchema,
  memoryOutputSchema,
  messageOutputSchema,
  missionPlanSchema,
  nextActionOutputSchema,
  qualificationOutputSchema,
  replyClassificationOutputSchema,
  replyDraftOutputSchema,
  salesSignalOutputSchema,
  validateCompanyResearchOutput,
  validateOutreachDraft,
  validateSalesSignalOutput,
} from "./index";

describe("structured AI contracts", () => {
  it("accepts only the supported mission types and steps", () => {
    const plan = missionPlanSchema.safeParse({
      missionType: "EXPANSION_SIGNAL_OUTREACH",
      objective: "Find timely evidence-backed accounts.",
      summary: "Controlled outreach plan.",
      steps: [{ step: "LOAD_KNOWLEDGE", objective: "Load knowledge", expectedOutput: "Context" }],
      guardrails: ["Approval is required."],
    });
    expect(plan.success).toBe(true);
    expect(missionPlanSchema.safeParse({ ...plan.data, missionType: "DISTRIBUTOR_SEARCH" }).success).toBe(false);
    expect(missionPlanSchema.safeParse({ ...plan.data, steps: [{ step: "SEND_EMAIL", objective: "Send", expectedOutput: "Sent" }] }).success).toBe(false);
  });

  it("returns a schema-validated deterministic mission plan", async () => {
    const result = await new MockAIProvider().generateStructured({
      operation: "mission-plan",
      systemInstruction: "Plan the mission.",
      input: { missionType: "TARGET_ACCOUNT_DISCOVERY", objective: "Find DACH manufacturers." },
      outputSchema: missionPlanSchema,
      promptVersion: "test-v1",
    });
    expect(result.provider).toBe("mock-ai");
    expect(result.data.missionType).toBe("TARGET_ACCOUNT_DISCOVERY");
    expect(result.data.steps.map((step) => step.step)).toContain("GENERATE_OUTREACH");
  });

  it("requires source URLs for signal evidence", () => {
    expect(validateSalesSignalOutput({ signals: [{ type: "EXPANSION", summary: "New factory", confidence: 0.8, evidenceUrls: [] }], summary: "A signal" }).valid).toBe(false);
    expect(salesSignalOutputSchema.safeParse({ signals: [{ type: "EXPANSION", summary: "New factory", confidence: 0.8, evidenceUrls: ["https://nova-automation.example/source"] }], summary: "A signal" }).success).toBe(true);
  });

  it("requires a source URL whenever company research quotes evidence", () => {
    expect(validateCompanyResearchOutput({
      companyName: "Nova Automation", companyDomain: "nova-automation.example", summary: "Test", risks: [],
      evidence: [{ type: "WEBSITE", title: "Factory", summary: "Factory page", quote: "Three halls", sourceUrl: "", observedAt: "2026-07-01T00:00:00.000Z", confidence: 0.9 }],
    }).valid).toBe(false);
  });

  it("rejects prohibited claims and uncited outreach", () => {
    const invalid = messageOutputSchema.parse({
      subjectVariants: ["A question"], selectedSubject: "A question", body: "We guarantee zero defects.", personalizationReason: "Test", claimsUsed: [], evidenceIds: ["e-1"], evidenceUrls: ["https://nova-automation.example/source"], riskFlags: [],
    });
    expect(validateOutreachDraft(invalid).valid).toBe(false);
  });
});

describe("AI provider contract regressions", () => {
  it("returns schema-validated qualification output without paid API calls", async () => {
    const result = await new MockAIProvider().generateStructured({ operation: "qualification", systemInstruction: "Use evidence only.", input: { evidenceIds: ["evidence-1"] }, outputSchema: qualificationOutputSchema, promptVersion: "test-v1" });
    expect(result.data).toMatchObject({ score: 84, status: "STRONG_FIT", evidenceIds: ["evidence-1"] });
    expect(qualificationOutputSchema.safeParse({ ...result.data, score: 40, status: "STRONG_FIT" }).success).toBe(false);
  });

  it("returns evidence-linked message output", async () => {
    const result = await new MockAIProvider().generateStructured({ operation: "message", systemInstruction: "Use approved claims only.", input: { evidenceIds: ["evidence-2"] }, outputSchema: messageOutputSchema, promptVersion: "test-v1" });
    expect(result.data.evidenceIds).toEqual(["evidence-2"]);
    expect(result.data.body).toContain(result.data.evidenceUrls[0]!);
    expect(result.estimatedCost).toBe(0);
  });

  it("returns schema-validated company research, signals, and reply intelligence", async () => {
    const provider = new MockAIProvider();
    const research = await provider.generateStructured({ operation: "company-research", systemInstruction: "Research.", input: {}, outputSchema: companyResearchOutputSchema, promptVersion: "test-v1" });
    const signals = await provider.generateStructured({ operation: "signal-extraction", systemInstruction: "Extract.", input: {}, outputSchema: salesSignalOutputSchema, promptVersion: "test-v1" });
    const reply = await provider.generateStructured({ operation: "reply-classification", systemInstruction: "Classify.", input: { body: "What line speed is supported?" }, outputSchema: replyClassificationOutputSchema, promptVersion: "reply-v1" });
    expect(research.data.evidence[0]!.sourceUrl).toMatch(/^https:/);
    expect(signals.data.signals[0]!.evidenceUrls).toHaveLength(1);
    expect(reply.data.classification).toBe("QUESTION");
  });

  it("keeps every existing deterministic reply operation schema-compatible", async () => {
    const provider = new MockAIProvider();
    const classification = await provider.generateStructured({ operation: "reply-classification", systemInstruction: "Classify.", input: {}, outputSchema: replyClassificationOutputSchema, promptVersion: "reply-v1" });
    const summary = await provider.generateStructured({ operation: "conversation-summary", systemInstruction: "Summarize.", input: { sourceMessageIds: ["message-1"] }, outputSchema: conversationSummaryOutputSchema, promptVersion: "reply-v1" });
    const memory = await provider.generateStructured({ operation: "memory", systemInstruction: "Remember.", input: { messageId: "message-1" }, outputSchema: memoryOutputSchema, promptVersion: "reply-v1" });
    const action = await provider.generateStructured({ operation: "next-action", systemInstruction: "Act.", input: { messageId: "message-1" }, outputSchema: nextActionOutputSchema, promptVersion: "reply-v1" });
    const draft = await provider.generateStructured({ operation: "reply-draft", systemInstruction: "Draft.", input: { evidenceIds: ["evidence-1"] }, outputSchema: replyDraftOutputSchema, promptVersion: "reply-v1" });
    expect(classification.data.classification).toBe("QUESTION");
    expect(summary.data.sourceMessageIds).toEqual(["message-1"]);
    expect(memory.data.facts[0]!.sourceMessageId).toBe("message-1");
    expect(action.data.sourceMessageId).toBe("message-1");
    expect(draft.data.evidenceIds).toEqual(["evidence-1"]);
  });
});
