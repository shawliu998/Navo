import { and, eq } from "drizzle-orm";
import { inboundWebhookIdempotencyKey, normalizeInboundWebhookEvent, type InboundWebhookEvent } from "@navo/domain";
import { db, messages, processInboundReply, type InboundReplyEvent, type Transaction } from "@navo/db";
import { createReplyFollowUpMission, type ReplyFollowUpDependencies } from "./reply-follow-up";
import { z } from "zod";

const resendEmailSchema = z.object({
  id: z.string(),
  object: z.literal("email"),
  from: z.string(),
  to: z.array(z.string()).min(1).or(z.string().transform((value: string) => [value])),
  cc: z.array(z.string()).default([]),
  bcc: z.array(z.string()).default([]),
  subject: z.string().default(""),
  html: z.string().nullish().transform((value) => value ?? ""),
  text: z.string().nullish().transform((value) => value ?? ""),
  headers: z.union([
    z.record(z.string(), z.string()),
    z.array(z.object({ name: z.string(), value: z.string() })),
  ]).default({}),
  created_at: z.string().datetime().or(z.string()).optional(),
}).passthrough();

export type ResendReceivedEmail = z.output<typeof resendEmailSchema>;

export type ResendInboundDependencies = ReplyFollowUpDependencies & {
  fetch?: typeof fetch;
  apiKey?: string;
  workspaceId?: string;
};

export type ResendInboundResult =
  | { kind: "QUEUED"; inboundMessageId: string; missionId: string }
  | { kind: "DUPLICATE"; inboundMessageId: string }
  | { kind: "NO_MATCH"; reason: string }
  | { kind: "NOT_A_REPLY"; reason: string };

function getHeader(email: ResendReceivedEmail, name: string) {
  const lower = name.toLowerCase();
  if (Array.isArray(email.headers)) {
    return email.headers.find((header) => header.name.toLowerCase() === lower)?.value.trim();
  }
  const entry = Object.entries(email.headers).find(([headerName]) => headerName.toLowerCase() === lower);
  return entry?.[1].trim();
}

function extractMessageIds(value: string) {
  return [...value.matchAll(/<([^>]+)>/g)].map((match) => match[1]!).filter(Boolean);
}

function extractCandidateIds(email: ResendReceivedEmail) {
  const candidates = new Set<string>();
  const navoId = getHeader(email, "x-navo-message-id");
  if (navoId) candidates.add(navoId);

  const inReplyTo = getHeader(email, "in-reply-to");
  if (inReplyTo) extractMessageIds(inReplyTo).forEach((id) => candidates.add(id));

  const references = getHeader(email, "references");
  if (references) extractMessageIds(references).forEach((id) => candidates.add(id));

  return Array.from(candidates);
}

function firstTo(email: ResendReceivedEmail) {
  const raw = Array.isArray(email.to) ? email.to[0] : email.to;
  return raw ?? "";
}

export async function fetchResendReceivedEmail(emailId: string, dependencies: ResendInboundDependencies = {}) {
  const apiKey = dependencies.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const doFetch = dependencies.fetch ?? fetch;
  const response = await doFetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Resend email retrieval failed: ${response.status} ${await response.text().catch(() => "")}`.trim());
  }

  const raw = await response.json();
  return resendEmailSchema.parse(raw);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
}

async function matchOutboundMessage(workspaceId: string, email: ResendReceivedEmail, tx: Transaction) {
  const candidateIds = extractCandidateIds(email);
  if (candidateIds.length === 0) return null;

  for (const candidate of candidateIds) {
    if (isUuid(candidate)) {
      const [byId] = await tx.select().from(messages).where(and(
        eq(messages.workspaceId, workspaceId),
        eq(messages.id, candidate),
        eq(messages.direction, "OUTBOUND"),
      )).limit(1);
      if (byId) return byId;
    }

    const [byProviderId] = await tx.select().from(messages).where(and(
      eq(messages.workspaceId, workspaceId),
      eq(messages.providerMessageId, candidate),
      eq(messages.direction, "OUTBOUND"),
    )).limit(1);
    if (byProviderId) return byProviderId;
  }

  return null;
}

export function mapResendEmailToInboundEvent(email: ResendReceivedEmail): InboundWebhookEvent {
  const candidateIds = extractCandidateIds(email);
  const inReplyToProviderMessageId = candidateIds[0] ?? email.id;
  const normalized = normalizeInboundWebhookEvent({
    provider: "resend",
    eventId: email.id,
    inReplyToProviderMessageId,
    from: email.from,
    to: firstTo(email),
    subject: email.subject,
    textBody: email.text || email.html.replace(/<[^>]*>/g, " "),
  });
  return normalized;
}

export async function processResendInboundEmail(
  input: { emailId: string },
  dependencies: ResendInboundDependencies = {},
): Promise<ResendInboundResult> {
  const workspaceId = dependencies.workspaceId ?? process.env.NAVO_RESEND_WORKSPACE_ID ?? process.env.DEMO_WORKSPACE_ID ?? "";
  if (!workspaceId) throw new Error("Resend inbound processing requires a workspaceId.");

  const email = await fetchResendReceivedEmail(input.emailId, dependencies);

  return db.transaction(async (tx) => {
    const outbound = await matchOutboundMessage(workspaceId, email, tx);
    if (!outbound) return { kind: "NO_MATCH", reason: "No outbound Navo message matched the inbound email headers." };

    const event = mapResendEmailToInboundEvent(email);
    const replyEvent: InboundReplyEvent = {
      eventType: "REPLY",
      subject: event.subject,
      body: event.textBody,
      providerMessageId: email.id,
      providerEventId: event.eventId,
    };

    const result = await processInboundReply(workspaceId, outbound.id, replyEvent, {
      idempotencyKey: inboundWebhookIdempotencyKey(event),
    });

    if (!result) return { kind: "NO_MATCH", reason: "Outbound message was not found during reply processing." };

    if (result.duplicate) {
      return { kind: "DUPLICATE", inboundMessageId: result.message.id };
    }

    const mission = await createReplyFollowUpMission(
      { workspaceId, inboundMessageId: result.message.id },
      { ai: dependencies.ai, enqueueMission: dependencies.enqueueMission },
    );

    if (mission.kind === "INVALID_SOURCE_MESSAGE") {
      return { kind: "NOT_A_REPLY", reason: "Persisted source message is not an inbound reply." };
    }

    return { kind: "QUEUED", inboundMessageId: result.message.id, missionId: mission.mission.id };
  });
}
