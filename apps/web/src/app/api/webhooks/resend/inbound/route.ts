import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySvixPayload, SvixVerificationError } from "@/lib/svix";
import { enqueueResendInbound } from "@/lib/mission-queue";

const resendEventSchema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string(),
  }).passthrough(),
}).passthrough();

function svixHeaders(headers: Headers) {
  return {
    "svix-id": headers.get("svix-id"),
    "svix-timestamp": headers.get("svix-timestamp"),
    "svix-signature": headers.get("svix-signature"),
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Resend webhook secret is not configured." } }, { status: 503 });
  }

  const rawBody = await request.text();
  const headers = svixHeaders(request.headers);

  try {
    verifySvixPayload(rawBody, headers, secret);
  } catch (error) {
    const message = error instanceof SvixVerificationError ? error.message : "Webhook verification failed.";
    return NextResponse.json({ error: { code: "SIGNATURE_INVALID", message } }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } }, { status: 422 });
  }

  const parsed = resendEventSchema.safeParse(event);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid Resend event shape." } }, { status: 422 });
  }

  if (parsed.data.type !== "email.received") {
    return new NextResponse(null, { status: 204 });
  }

  try {
    await enqueueResendInbound({ emailId: parsed.data.data.email_id });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Queue submission failed.";
    console.error(`Failed to enqueue Resend inbound email ${parsed.data.data.email_id}: ${message}`);
    return NextResponse.json({ error: { code: "QUEUE_UNAVAILABLE", message: "Could not queue inbound email for processing." } }, { status: 503 });
  }

  return NextResponse.json({ data: { emailId: parsed.data.data.email_id, queued: true } }, { status: 202 });
}
