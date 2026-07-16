import { describe, expect, it } from "vitest";
import { MockAIProvider, messageOutputSchema, qualificationOutputSchema, replyClassificationOutputSchema } from "./index";

describe("AI provider contract", () => {
  it("returns schema-validated qualification output without paid API calls", async () => {
    const result = await new MockAIProvider().generateStructured({
      operation: "qualification",
      systemInstruction: "Use evidence only.",
      input: { evidenceIds: ["evidence-1"] },
      outputSchema: qualificationOutputSchema,
      promptVersion: "test-v1",
    });
    expect(result.provider).toBe("mock-ai");
    expect(result.data).toMatchObject({ score: 84, status: "STRONG_FIT", evidenceIds: ["evidence-1"] });
  });

  it("returns evidence-linked message output", async () => {
    const result = await new MockAIProvider().generateStructured({
      operation: "message",
      systemInstruction: "Use approved claims only.",
      input: { evidenceIds: ["evidence-2"] },
      outputSchema: messageOutputSchema,
      promptVersion: "test-v1",
    });
    expect(result.data.evidenceIds).toEqual(["evidence-2"]);
    expect(result.estimatedCost).toBe(0);
  });

  it("returns schema-validated reply intelligence without a live DeepSeek call", async () => {
    const result = await new MockAIProvider().generateStructured({ operation: "reply-classification", systemInstruction: "Classify the inbound reply.", input: { body: "What line speed is supported?" }, outputSchema: replyClassificationOutputSchema, promptVersion: "reply-v1" });
    expect(result.data.classification).toBe("QUESTION");
    expect(result.data.confidence).toBeGreaterThan(.8);
  });
});
