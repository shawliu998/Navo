import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { Webhook } from "svix";
import { verifySvixPayload, SvixVerificationError } from "../src/lib/svix";

const secret = "whsec_" + Buffer.from("a-very-secret-key-of-at-least-thirty-two-bytes-long").toString("base64");

const enqueueResendInbound = vi.fn<(payload: { emailId: string }) => Promise<unknown>>();

vi.mock("../src/lib/mission-queue", () => ({
  enqueueResendInbound: (payload: { emailId: string }) => enqueueResendInbound(payload),
}));

function makeSignature(secretKey: string, rawBody: string, timestamp: string, messageId = "msg_123") {
  return new Webhook(secretKey).sign(messageId, new Date(Number(timestamp) * 1_000), rawBody);
}

function makeRequest(rawBody: string, headers: Record<string, string>): NextRequest {
  return new Request("http://localhost:3100/api/webhooks/resend/inbound", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody,
  }) as NextRequest;
}

describe("Svix signature verification", () => {
  it("accepts a correctly signed payload", () => {
    const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = makeSignature(secret, rawBody, timestamp);
    expect(verifySvixPayload(rawBody, { "svix-id": "msg_123", "svix-timestamp": timestamp, "svix-signature": signature }, secret)).toMatchObject({ id: "msg_123", timestamp: Number(timestamp), event: { type: "email.received" } });
  });

  it("rejects a missing header", () => {
    expect(() => verifySvixPayload("body", { "svix-id": "msg", "svix-timestamp": null, "svix-signature": null }, secret)).toThrow(SvixVerificationError);
  });

  it("rejects a bad signature", () => {
    const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(() => verifySvixPayload(rawBody, { "svix-id": "msg", "svix-timestamp": timestamp, "svix-signature": "v1,bad" }, secret)).toThrow(SvixVerificationError);
  });

  it("binds the signature to the Svix message id", () => {
    const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = makeSignature(secret, rawBody, timestamp, "msg_original");
    expect(() => verifySvixPayload(rawBody, { "svix-id": "msg_tampered", "svix-timestamp": timestamp, "svix-signature": signature }, secret)).toThrow();
  });

  it("rejects an old timestamp", () => {
    const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });
    const timestamp = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const signature = makeSignature(secret, rawBody, timestamp, "msg");
    expect(() => verifySvixPayload(rawBody, { "svix-id": "msg", "svix-timestamp": timestamp, "svix-signature": signature }, secret)).toThrow();
  });
});

describe("Resend inbound webhook route", () => {
  it.each([
    ["missing secret", { RESEND_WEBHOOK_SECRET: "" }, 503, "WEBHOOK_NOT_CONFIGURED"],
    ["invalid signature", { RESEND_WEBHOOK_SECRET: secret }, 401, "SIGNATURE_INVALID"],
  ])("returns expected error for %s", async (_label, env, status, code) => {
    const prev = process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_WEBHOOK_SECRET = env.RESEND_WEBHOOK_SECRET;
    enqueueResendInbound.mockReset();
    const { POST } = await import("../src/app/api/webhooks/resend/inbound/route");
    const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });
    const request = makeRequest(rawBody, { "svix-id": "msg", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,bad" });
    const response = await POST(request);
    process.env.RESEND_WEBHOOK_SECRET = prev;
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });

  it("ignores non-email.received events and returns 204", async () => {
    const prev = process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_WEBHOOK_SECRET = secret;
    enqueueResendInbound.mockReset();
    const { POST } = await import("../src/app/api/webhooks/resend/inbound/route");
    const rawBody = JSON.stringify({ type: "email.sent", data: { email_id: "email_123" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = makeSignature(secret, rawBody, timestamp, "msg");
    const request = makeRequest(rawBody, { "svix-id": "msg", "svix-timestamp": timestamp, "svix-signature": signature });
    const response = await POST(request);
    process.env.RESEND_WEBHOOK_SECRET = prev;
    expect(response.status).toBe(204);
  });

  it("queues a valid email.received event and returns 202", async () => {
    const prev = process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_WEBHOOK_SECRET = secret;
    enqueueResendInbound.mockReset();
    enqueueResendInbound.mockResolvedValue(undefined);
    const { POST } = await import("../src/app/api/webhooks/resend/inbound/route");
    const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = makeSignature(secret, rawBody, timestamp, "msg");
    const request = makeRequest(rawBody, { "svix-id": "msg", "svix-timestamp": timestamp, "svix-signature": signature });
    const response = await POST(request);
    process.env.RESEND_WEBHOOK_SECRET = prev;
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ data: { emailId: "email_123", queued: true } });
    expect(enqueueResendInbound).toHaveBeenCalledWith({ emailId: "email_123" });
  });

  it("returns a retryable 503 when queue submission fails", async () => {
    const prev = process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_WEBHOOK_SECRET = secret;
    enqueueResendInbound.mockReset();
    enqueueResendInbound.mockRejectedValue(new Error("redis down"));
    const { POST } = await import("../src/app/api/webhooks/resend/inbound/route");
    const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = makeSignature(secret, rawBody, timestamp, "msg");
    const request = makeRequest(rawBody, { "svix-id": "msg", "svix-timestamp": timestamp, "svix-signature": signature });
    const response = await POST(request);
    process.env.RESEND_WEBHOOK_SECRET = prev;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "QUEUE_UNAVAILABLE" } });
  });
});
