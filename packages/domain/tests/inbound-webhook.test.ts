import { describe, expect, it } from "vitest";
import { inboundWebhookEventSchema, inboundWebhookIdempotencyKey, normalizeInboundWebhookEvent } from "../src/inbound-webhook";

const event = {
  provider: "Postmark",
  eventId: "evt_123",
  inReplyToProviderMessageId: "outbound_456",
  from: "  Prospect@Example.COM ",
  to: " Sales@Navo.Example ",
  subject: " Re:  A question ",
  textBody: "  Yes, let's talk.  ",
};

describe("inbound webhook contract", () => {
  it("normalizes provider-neutral reply events before persistence", () => {
    expect(normalizeInboundWebhookEvent(event)).toEqual({
      provider: "postmark",
      eventId: "evt_123",
      inReplyToProviderMessageId: "outbound_456",
      from: "prospect@example.com",
      to: "sales@navo.example",
      subject: "Re: A question",
      textBody: "Yes, let's talk.",
    });
  });

  it.each(["provider", "eventId", "inReplyToProviderMessageId", "from", "to", "subject", "textBody"])("rejects a missing %s", (field) => {
    const payload = { ...event, [field]: " " };
    expect(inboundWebhookEventSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects fields outside the ingress contract", () => {
    expect(inboundWebhookEventSchema.safeParse({ ...event, providerSecret: "must-not-persist" }).success).toBe(false);
  });

  it("uses the same provider event identity for duplicate deliveries", () => {
    const first = normalizeInboundWebhookEvent(event);
    const replay = normalizeInboundWebhookEvent({ ...event, provider: " postmark ", textBody: "Changed replay payload" });

    expect(inboundWebhookIdempotencyKey(first)).toBe(inboundWebhookIdempotencyKey(replay));
    expect(inboundWebhookIdempotencyKey(first)).not.toBe(inboundWebhookIdempotencyKey({ ...first, provider: "resend" }));
    expect(inboundWebhookIdempotencyKey(first)).not.toBe(inboundWebhookIdempotencyKey({ ...first, eventId: "evt_124" }));
  });
});
