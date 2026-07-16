import { z } from "zod";

export const replyClassificationSchema = z.enum([
  "POSITIVE",
  "QUESTION",
  "REFERRAL",
  "NOT_NOW",
  "NOT_INTERESTED",
  "OUT_OF_OFFICE",
  "UNSUBSCRIBE",
  "BOUNCE",
  "SPAM_COMPLAINT",
  "UNKNOWN",
]);
export type ReplyClassification = z.infer<typeof replyClassificationSchema>;

export const replyEventTypeSchema = z.enum([
  "REPLY",
  "BOUNCE",
  "UNSUBSCRIBE",
  "SPAM_COMPLAINT",
]);
export type ReplyEventType = z.infer<typeof replyEventTypeSchema>;

export const replyInputSchema = z.object({
  messageId: z.string().min(1),
  subject: z.string().default(""),
  body: z.string().default(""),
  eventType: replyEventTypeSchema.default("REPLY"),
});
export type ReplyInput = z.infer<typeof replyInputSchema>;

export const messageClassificationSchema = z.object({
  classification: replyClassificationSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().min(1)).min(1),
  matchedTerms: z.array(z.string()),
  classifierVersion: z.literal("DETERMINISTIC_REPLY_V1"),
});
export type MessageClassification = z.infer<typeof messageClassificationSchema>;

type SemanticRule = {
  classification: ReplyClassification;
  confidence: number;
  terms: readonly string[];
};

// Compliance and delivery outcomes deliberately precede commercial intent.
const semanticRules: readonly SemanticRule[] = [
  {
    classification: "SPAM_COMPLAINT",
    confidence: 0.99,
    terms: ["report spam", "reported as spam", "spam complaint", "垃圾邮件投诉"],
  },
  {
    classification: "BOUNCE",
    confidence: 0.99,
    terms: [
      "delivery failed",
      "undeliverable",
      "mailbox unavailable",
      "address not found",
      "message bounced",
      "退信",
    ],
  },
  {
    classification: "UNSUBSCRIBE",
    confidence: 0.99,
    terms: [
      "unsubscribe",
      "remove me",
      "stop emailing",
      "do not contact",
      "don't contact",
      "取消订阅",
      "不要再联系",
    ],
  },
  {
    classification: "OUT_OF_OFFICE",
    confidence: 0.98,
    terms: [
      "out of office",
      "automatic reply",
      "auto reply",
      "on vacation",
      "annual leave",
      "away from the office",
      "休假",
      "自动回复",
    ],
  },
  {
    classification: "NOT_INTERESTED",
    confidence: 0.94,
    terms: [
      "not interested",
      "no interest",
      "not a fit",
      "not relevant",
      "we'll pass",
      "we will pass",
      "没有兴趣",
      "不感兴趣",
    ],
  },
  {
    classification: "NOT_NOW",
    confidence: 0.9,
    terms: [
      "not now",
      "later this year",
      "next quarter",
      "circle back",
      "reach out later",
      "follow up later",
      "现在不方便",
      "以后再联系",
      "下个季度",
    ],
  },
  {
    classification: "REFERRAL",
    confidence: 0.9,
    terms: [
      "speak with",
      "talk to",
      "contact my colleague",
      "right person is",
      "copying my colleague",
      "i've cc'd",
      "i have cc'd",
      "请联系",
      "负责人是",
    ],
  },
  {
    classification: "QUESTION",
    confidence: 0.86,
    terms: [
      "?",
      "how much",
      "what is",
      "what are",
      "can you",
      "could you",
      "do you",
      "where is",
      "when can",
      "是否",
      "多少",
      "怎么",
      "吗？",
      "？",
    ],
  },
  {
    classification: "POSITIVE",
    confidence: 0.84,
    terms: [
      "interested",
      "sounds good",
      "let's talk",
      "lets talk",
      "book a call",
      "schedule a call",
      "send me details",
      "happy to discuss",
      "感兴趣",
      "可以聊聊",
      "请发资料",
    ],
  },
] as const;

const eventClassifications: Partial<Record<ReplyEventType, ReplyClassification>> = {
  BOUNCE: "BOUNCE",
  UNSUBSCRIBE: "UNSUBSCRIBE",
  SPAM_COMPLAINT: "SPAM_COMPLAINT",
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Classifies an inbound event without network calls, mutable state, or model output. */
export function classifyReply(rawInput: ReplyInput): MessageClassification {
  const input = replyInputSchema.parse(rawInput);
  const eventClassification = eventClassifications[input.eventType];
  if (eventClassification) {
    return {
      classification: eventClassification,
      confidence: 1,
      reasons: [`EMAIL_EVENT_${input.eventType}`],
      matchedTerms: [],
      classifierVersion: "DETERMINISTIC_REPLY_V1",
    };
  }

  const text = normalize(`${input.subject} ${input.body}`);
  for (const rule of semanticRules) {
    const matchedTerms = rule.terms.filter((term) => text.includes(term));
    if (matchedTerms.length > 0) {
      return {
        classification: rule.classification,
        confidence: rule.confidence,
        reasons: [`MATCHED_${rule.classification}_TERMS`],
        matchedTerms,
        classifierVersion: "DETERMINISTIC_REPLY_V1",
      };
    }
  }

  return {
    classification: "UNKNOWN",
    confidence: 0.35,
    reasons: [text.length === 0 ? "EMPTY_REPLY" : "NO_DETERMINISTIC_RULE_MATCHED"],
    matchedTerms: [],
    classifierVersion: "DETERMINISTIC_REPLY_V1",
  };
}

export const conversationMessageSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  subject: z.string().optional(),
  body: z.string(),
  occurredAt: z.iso.datetime(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationSummarySchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  classification: replyClassificationSchema,
  requiresResponse: z.boolean(),
  keyPoints: z.array(z.string()),
  sourceMessageIds: z.array(z.string().min(1)).min(1),
  summarizerVersion: z.literal("DETERMINISTIC_SUMMARY_V1"),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

const responseRequired = new Set<ReplyClassification>([
  "POSITIVE",
  "QUESTION",
  "REFERRAL",
  "NOT_NOW",
  "UNKNOWN",
]);

const classificationLabels: Record<ReplyClassification, string> = {
  POSITIVE: "Positive buying interest",
  QUESTION: "Prospect asked a question",
  REFERRAL: "Prospect provided a referral",
  NOT_NOW: "Prospect requested later follow-up",
  NOT_INTERESTED: "Prospect is not interested",
  OUT_OF_OFFICE: "Contact is out of office",
  UNSUBSCRIBE: "Contact requested no further email",
  BOUNCE: "Email could not be delivered",
  SPAM_COMPLAINT: "Recipient reported spam",
  UNKNOWN: "Reply needs human review",
};

const compactText = (value: string, maxLength = 240) => {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length <= maxLength
    ? compacted
    : `${compacted.slice(0, maxLength - 1).trimEnd()}…`;
};

/** Produces a source-linked extractive summary and never invents conversation facts. */
export function summarizeConversation(input: {
  messages: ConversationMessage[];
  classification: ReplyClassification;
}): ConversationSummary {
  const messages = z.array(conversationMessageSchema).min(1).parse(input.messages);
  const classification = replyClassificationSchema.parse(input.classification);
  const latestInbound = [...messages].reverse().find((message) => message.direction === "INBOUND");
  const source = latestInbound ?? messages.at(-1);
  if (!source) throw new Error("A conversation summary requires at least one message.");
  const excerpt = compactText(source.body) || "Message has no body content.";

  return {
    headline: classificationLabels[classification],
    summary: `${classificationLabels[classification]}. Latest message: ${excerpt}`,
    classification,
    requiresResponse: responseRequired.has(classification),
    keyPoints: [excerpt],
    sourceMessageIds: messages.map((message) => message.id),
    summarizerVersion: "DETERMINISTIC_SUMMARY_V1",
  };
}

export const memoryFactSchema = z.object({
  category: z.enum(["ENGAGEMENT", "QUESTION", "RELATIONSHIP", "TIMING", "COMPLIANCE", "DELIVERABILITY", "AVAILABILITY"]),
  key: z.string().min(1),
  value: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sourceMessageId: z.string().min(1),
  observedAt: z.iso.datetime(),
  derivation: z.literal("DETERMINISTIC_REPLY_V1"),
});
export type MemoryFact = z.infer<typeof memoryFactSchema>;

const memoryRuleByClassification: Partial<
  Record<ReplyClassification, Pick<MemoryFact, "category" | "key">>
> = {
  POSITIVE: { category: "ENGAGEMENT", key: "commercial_interest" },
  QUESTION: { category: "QUESTION", key: "latest_open_question" },
  REFERRAL: { category: "RELATIONSHIP", key: "referral_context" },
  NOT_NOW: { category: "TIMING", key: "follow_up_timing" },
  NOT_INTERESTED: { category: "ENGAGEMENT", key: "commercial_interest" },
  OUT_OF_OFFICE: { category: "AVAILABILITY", key: "contact_availability" },
  UNSUBSCRIBE: { category: "COMPLIANCE", key: "do_not_contact" },
  BOUNCE: { category: "DELIVERABILITY", key: "email_delivery_status" },
  SPAM_COMPLAINT: { category: "COMPLIANCE", key: "spam_complaint" },
};

const fixedMemoryValues: Partial<Record<ReplyClassification, string>> = {
  POSITIVE: "positive",
  NOT_INTERESTED: "not_interested",
  OUT_OF_OFFICE: "out_of_office",
  UNSUBSCRIBE: "true",
  BOUNCE: "bounced",
  SPAM_COMPLAINT: "true",
};

/** Derives at most one evidence-linked fact; UNKNOWN produces no durable memory. */
export function deriveMemoryFacts(input: {
  messageId: string;
  body: string;
  classification: ReplyClassification;
  confidence: number;
  observedAt: string;
}): MemoryFact[] {
  const classification = replyClassificationSchema.parse(input.classification);
  const rule = memoryRuleByClassification[classification];
  if (!rule) return [];

  const value = fixedMemoryValues[classification] ?? compactText(input.body, 300);
  if (!value) return [];

  return [
    memoryFactSchema.parse({
      ...rule,
      value,
      confidence: input.confidence,
      sourceMessageId: input.messageId,
      observedAt: input.observedAt,
      derivation: "DETERMINISTIC_REPLY_V1",
    }),
  ];
}

export const nextActionTypeSchema = z.enum([
  "PREPARE_MEETING",
  "DRAFT_ANSWER",
  "VERIFY_REFERRAL",
  "SCHEDULE_FOLLOW_UP",
  "CLOSE_OUT",
  "WAIT_FOR_RETURN",
  "SUPPRESS_CONTACT",
  "REPAIR_DELIVERY",
  "ESCALATE_COMPLAINT",
  "HUMAN_REVIEW",
]);
export type NextActionType = z.infer<typeof nextActionTypeSchema>;

export const nextBestActionSchema = z.object({
  actionType: nextActionTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueInHours: z.number().int().nonnegative(),
  requiresApproval: z.boolean(),
  reason: z.string().min(1),
  sourceMessageId: z.string().min(1),
  proposerVersion: z.literal("DETERMINISTIC_NEXT_ACTION_V1"),
});
export type NextBestAction = z.infer<typeof nextBestActionSchema>;

type NextActionRule = Omit<NextBestAction, "sourceMessageId" | "proposerVersion">;

const nextActionRules: Record<ReplyClassification, NextActionRule> = {
  POSITIVE: { actionType: "PREPARE_MEETING", title: "Prepare a discovery meeting", description: "Review the account memory and propose meeting times.", priority: "HIGH", dueInHours: 4, requiresApproval: true, reason: "The contact expressed positive buying interest." },
  QUESTION: { actionType: "DRAFT_ANSWER", title: "Draft an evidence-backed answer", description: "Answer the contact's question using approved claims and evidence.", priority: "HIGH", dueInHours: 4, requiresApproval: true, reason: "The contact asked a question that requires a response." },
  REFERRAL: { actionType: "VERIFY_REFERRAL", title: "Verify the referred contact", description: "Confirm the referred person's role and contact details before outreach.", priority: "MEDIUM", dueInHours: 24, requiresApproval: false, reason: "The reply points to another stakeholder." },
  NOT_NOW: { actionType: "SCHEDULE_FOLLOW_UP", title: "Schedule a later follow-up", description: "Respect the requested timing and create a follow-up reminder.", priority: "LOW", dueInHours: 24, requiresApproval: false, reason: "The contact asked to reconnect later." },
  NOT_INTERESTED: { actionType: "CLOSE_OUT", title: "Close the active outreach", description: "Stop the sequence and record the loss reason.", priority: "MEDIUM", dueInHours: 8, requiresApproval: false, reason: "The contact said the offer is not relevant." },
  OUT_OF_OFFICE: { actionType: "WAIT_FOR_RETURN", title: "Wait for the contact to return", description: "Pause outreach and review the stated return timing.", priority: "LOW", dueInHours: 72, requiresApproval: false, reason: "An out-of-office response was received." },
  UNSUBSCRIBE: { actionType: "SUPPRESS_CONTACT", title: "Suppress the contact", description: "Apply do-not-contact immediately and stop all active outreach.", priority: "URGENT", dueInHours: 0, requiresApproval: false, reason: "The contact explicitly requested no further email." },
  BOUNCE: { actionType: "REPAIR_DELIVERY", title: "Repair contact deliverability", description: "Stop sends to this address and find a verified replacement.", priority: "HIGH", dueInHours: 8, requiresApproval: false, reason: "The last email could not be delivered." },
  SPAM_COMPLAINT: { actionType: "ESCALATE_COMPLAINT", title: "Escalate the spam complaint", description: "Suppress the contact and open an immediate compliance review.", priority: "URGENT", dueInHours: 0, requiresApproval: false, reason: "A spam complaint requires immediate compliance action." },
  UNKNOWN: { actionType: "HUMAN_REVIEW", title: "Review the reply", description: "A person should classify the reply and choose the next step.", priority: "MEDIUM", dueInHours: 24, requiresApproval: false, reason: "No deterministic classification rule matched." },
};

/** Maps each classification to a stable, auditable next-best-action proposal. */
export function proposeNextBestAction(input: {
  messageId: string;
  classification: ReplyClassification;
}): NextBestAction {
  const classification = replyClassificationSchema.parse(input.classification);
  return nextBestActionSchema.parse({
    ...nextActionRules[classification],
    sourceMessageId: input.messageId,
    proposerVersion: "DETERMINISTIC_NEXT_ACTION_V1",
  });
}
