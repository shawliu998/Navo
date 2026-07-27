import { DEMO_WORKSPACE_ID } from "@navo/db/queries";
import { processInboundReply, type InboundReplyEvent } from "@navo/db";

export type EmailSinkEvent = {
  eventType: InboundReplyEvent["eventType"];
  subject?: string;
  body?: string;
  eventId?: string;
};

export async function processEmailSinkEvent(messageId: string, event: EmailSinkEvent) {
  const fingerprint = event.eventId ?? (() => {
    let hash = 2166136261;
    const value = `${event.eventType}:${event.subject ?? ""}:${event.body ?? ""}`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  })();
  const idempotencyKey = `email-sink:${messageId}:${event.eventType}:${fingerprint}`;

  return processInboundReply(DEMO_WORKSPACE_ID, messageId, {
    eventType: event.eventType,
    subject: event.subject,
    body: event.body ?? `${event.eventType} event received by EmailSink.`,
    providerMessageId: `email-sink-${fingerprint}`,
    providerEventId: fingerprint,
  }, { idempotencyKey, actorName: "EmailSink", provider: "email-sink" });
}
