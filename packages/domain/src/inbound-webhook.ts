import { z } from "zod";

const requiredText = (field: string) => z.string({ error: `${field} is required.` }).trim().min(1, `${field} is required.`);

const normalizeEmailAddress = (value: string) => value.trim().toLowerCase();

/**
 * Provider-neutral payload accepted at the ingress boundary. Providers should
 * map their own webhook shape to this contract before it reaches Navo.
 */
export const inboundWebhookEventSchema = z.object({
  provider: requiredText("provider").transform((value) => value.toLowerCase()),
  eventId: requiredText("eventId"),
  inReplyToProviderMessageId: requiredText("inReplyToProviderMessageId"),
  from: requiredText("from").transform(normalizeEmailAddress),
  to: requiredText("to").transform(normalizeEmailAddress),
  subject: requiredText("subject").transform((value) => value.replace(/\s+/g, " ")),
  textBody: requiredText("textBody"),
}).strict();

export type InboundWebhookEvent = z.output<typeof inboundWebhookEventSchema>;

export function normalizeInboundWebhookEvent(input: unknown): InboundWebhookEvent {
  return inboundWebhookEventSchema.parse(input);
}

/**
 * Delivery identity is provider-scoped: different providers may use the same
 * event id, while repeated delivery of one provider event maps to this key.
 */
export function inboundWebhookIdempotencyKey(event: Pick<InboundWebhookEvent, "provider" | "eventId">) {
  return `inbound-webhook:${encodeURIComponent(event.provider)}:${encodeURIComponent(event.eventId)}`;
}
