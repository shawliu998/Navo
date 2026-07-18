import { Webhook, WebhookVerificationError } from "svix";

export class SvixVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvixVerificationError";
  }
}

export function verifySvixPayload(rawBody: string, headers: {
  "svix-id"?: string | null;
  "svix-timestamp"?: string | null;
  "svix-signature"?: string | null;
}, secret: string) {
  const id = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signature = headers["svix-signature"];

  if (!id || !timestamp || !signature) {
    throw new SvixVerificationError("Missing Svix signature headers.");
  }

  try {
    const event = new Webhook(secret).verify(rawBody, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    });
    return { id, timestamp: Number(timestamp), event };
  } catch (cause) {
    const message = cause instanceof WebhookVerificationError ? cause.message : "Svix signature verification failed.";
    throw new SvixVerificationError(message);
  }
}
