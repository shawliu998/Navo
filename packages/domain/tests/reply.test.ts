import { describe, expect, it } from "vitest";
import {
  classifyReply,
  deriveMemoryFacts,
  proposeNextBestAction,
  replyClassificationSchema,
  summarizeConversation,
  type ReplyClassification,
} from "../src";

describe("deterministic reply classification", () => {
  const cases: Array<[ReplyClassification, string]> = [
    ["POSITIVE", "This sounds good. Let's talk next week."],
    ["QUESTION", "Can you share how much the inspection package costs?"],
    ["REFERRAL", "Please speak with Morgan, the right person is in procurement."],
    ["NOT_NOW", "Not now, please circle back next quarter."],
    ["NOT_INTERESTED", "Thank you, but this is not relevant for us."],
    ["OUT_OF_OFFICE", "Automatic reply: I am out of office until Monday."],
    ["UNSUBSCRIBE", "Please remove me and stop emailing."],
    ["BOUNCE", "Delivery failed: mailbox unavailable."],
    ["SPAM_COMPLAINT", "The recipient reported as spam."],
    ["UNKNOWN", "Acknowledged."],
  ];

  it.each(cases)("classifies %s", (classification, body) => {
    expect(classifyReply({ messageId: "m1", body, subject: "", eventType: "REPLY" }).classification).toBe(classification);
  });

  it("lets EmailSink event types override ambiguous content", () => {
    expect(classifyReply({ messageId: "m1", body: "Sounds good", subject: "", eventType: "UNSUBSCRIBE" })).toMatchObject({ classification: "UNSUBSCRIBE", confidence: 1 });
  });

  it("prioritizes compliance language over a positive phrase", () => {
    expect(classifyReply({ messageId: "m1", body: "I was interested, but please unsubscribe me.", subject: "", eventType: "REPLY" }).classification).toBe("UNSUBSCRIBE");
  });

  it("publishes exactly the supported classification contract", () => {
    expect(replyClassificationSchema.options).toEqual([
      "POSITIVE", "QUESTION", "REFERRAL", "NOT_NOW", "NOT_INTERESTED",
      "OUT_OF_OFFICE", "UNSUBSCRIBE", "BOUNCE", "SPAM_COMPLAINT", "UNKNOWN",
    ]);
  });
});

describe("conversation summary and memory", () => {
  const observedAt = "2026-07-16T08:00:00.000Z";

  it("creates an extractive, source-linked summary from the latest inbound message", () => {
    const result = summarizeConversation({
      classification: "QUESTION",
      messages: [
        { id: "out-1", direction: "OUTBOUND", body: "Can we help?", occurredAt: observedAt },
        { id: "in-1", direction: "INBOUND", body: "  Can you send the technical data sheet?  ", occurredAt: observedAt },
      ],
    });

    expect(result).toMatchObject({
      headline: "Prospect asked a question",
      requiresResponse: true,
      keyPoints: ["Can you send the technical data sheet?"],
      sourceMessageIds: ["out-1", "in-1"],
    });
  });

  it("derives a durable fact with explicit message provenance", () => {
    expect(deriveMemoryFacts({ messageId: "in-1", body: "Please follow up next quarter.", classification: "NOT_NOW", confidence: 0.9, observedAt })).toEqual([
      expect.objectContaining({
        category: "TIMING",
        key: "follow_up_timing",
        value: "Please follow up next quarter.",
        sourceMessageId: "in-1",
      }),
    ]);
  });

  it("does not turn an unknown reply into durable account memory", () => {
    expect(deriveMemoryFacts({ messageId: "in-1", body: "Acknowledged.", classification: "UNKNOWN", confidence: 0.35, observedAt })).toEqual([]);
  });

  it("stores compliance state instead of copying raw unsubscribe text", () => {
    expect(deriveMemoryFacts({ messageId: "in-1", body: "Remove me", classification: "UNSUBSCRIBE", confidence: 1, observedAt })[0]).toMatchObject({ key: "do_not_contact", value: "true" });
  });
});

describe("next best action", () => {
  const expectedActions: Record<ReplyClassification, string> = {
    POSITIVE: "PREPARE_MEETING",
    QUESTION: "DRAFT_ANSWER",
    REFERRAL: "VERIFY_REFERRAL",
    NOT_NOW: "SCHEDULE_FOLLOW_UP",
    NOT_INTERESTED: "CLOSE_OUT",
    OUT_OF_OFFICE: "WAIT_FOR_RETURN",
    UNSUBSCRIBE: "SUPPRESS_CONTACT",
    BOUNCE: "REPAIR_DELIVERY",
    SPAM_COMPLAINT: "ESCALATE_COMPLAINT",
    UNKNOWN: "HUMAN_REVIEW",
  };

  it.each(Object.entries(expectedActions) as Array<[ReplyClassification, string]>)("maps %s to %s", (classification, actionType) => {
    expect(proposeNextBestAction({ messageId: "in-1", classification })).toMatchObject({ actionType, sourceMessageId: "in-1" });
  });

  it("makes unsubscribe suppression immediate and approval-free", () => {
    expect(proposeNextBestAction({ messageId: "in-1", classification: "UNSUBSCRIBE" })).toMatchObject({ priority: "URGENT", dueInHours: 0, requiresApproval: false });
  });
});
