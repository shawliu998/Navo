import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, count, eq } from "drizzle-orm";
import { accounts, agentMissions, contacts, db, messages, plays, playVersions, workspaces } from "@navo/db";
import { fetchResendReceivedEmail, mapResendEmailToInboundEvent, processResendInboundEmail } from "./resend-inbound";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;

function makeResendEmail(overrides: Partial<Parameters<typeof mapResendEmailToInboundEvent>[0]> = {}) {
  return {
    id: randomUUID(),
    object: "email" as const,
    from: "prospect@example.com",
    to: ["sales@navo.example"],
    cc: [],
    bcc: [],
    subject: "Re: Inline quality inspection",
    html: "<p>Yes, let's talk.</p>",
    text: "Yes, let's talk.",
    headers: [
      { name: "In-Reply-To", value: "<resend-outbound-123@resend.dev>" },
      { name: "References", value: "<resend-outbound-123@resend.dev>" },
    ],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Resend email fetch mapping", () => {
  it("maps a full Resend email to the provider-neutral contract", () => {
    const email = makeResendEmail();
    const event = mapResendEmailToInboundEvent(email);
    expect(event).toMatchObject({
      provider: "resend",
      eventId: email.id,
      inReplyToProviderMessageId: "resend-outbound-123@resend.dev",
      from: "prospect@example.com",
      to: "sales@navo.example",
      subject: "Re: Inline quality inspection",
      textBody: "Yes, let's talk.",
    });
  });

  it("accepts the object-shaped headers returned by the Resend receiving API", () => {
    const email = makeResendEmail({
      headers: {
        "in-reply-to": "<resend-outbound-123@resend.dev>",
        references: "<older@example.com> <resend-outbound-123@resend.dev>",
      },
    });
    const event = mapResendEmailToInboundEvent(email);
    expect(event.inReplyToProviderMessageId).toBe("resend-outbound-123@resend.dev");
  });

  it("accepts nullable text and html fields from the receiving API", async () => {
    const raw = { ...makeResendEmail(), text: null, html: null, headers: {} };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(raw), { status: 200 }));
    const email = await fetchResendReceivedEmail(raw.id, { fetch: fetchMock, apiKey: "re_key" });
    expect(email).toMatchObject({ text: "", html: "", headers: {} });
    expect(() => mapResendEmailToInboundEvent(email)).toThrow("textBody is required");
  });

  it("falls back to html-stripped text when plain text is absent", () => {
    const email = makeResendEmail({ text: "" });
    const event = mapResendEmailToInboundEvent(email);
    expect(event.textBody).toBe("Yes, let's talk.");
  });

  it("uses x-navo-message-id when present", () => {
    const email = makeResendEmail({ headers: [{ name: "X-Navo-Message-Id", value: "navo-msg-abc" }] });
    const event = mapResendEmailToInboundEvent(email);
    expect(event.inReplyToProviderMessageId).toBe("navo-msg-abc");
  });

  it("uses the Resend email id as a last-resort thread anchor", () => {
    const email = makeResendEmail({ headers: [] });
    const event = mapResendEmailToInboundEvent(email);
    expect(event.inReplyToProviderMessageId).toBe(email.id);
  });
});

describe("Resend email retrieval seam", () => {
  it("uses the injectable fetch and passes the bearer token", async () => {
    const email = makeResendEmail({ id: "retrieval-123" });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(email), { status: 200 }));
    const result = await fetchResendReceivedEmail("retrieval-123", { fetch: fetchMock, apiKey: "re_key" });
    expect(result.id).toBe("retrieval-123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails/receiving/retrieval-123",
      expect.objectContaining({ headers: { Authorization: "Bearer re_key", Accept: "application/json" } }),
    );
  });

  it("throws a production-safe error when retrieval fails", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("not found", { status: 404 }));
    await expect(fetchResendReceivedEmail("missing", { fetch: fetchMock, apiKey: "re_key" })).rejects.toThrow("Resend email retrieval failed: 404");
  });
});

describeDatabase("Resend inbound worker integration", () => {
  async function fixture() {
    const workspaceId = randomUUID();
    const userId = randomUUID();
    const accountId = randomUUID();
    const contactId = randomUUID();
    await db.insert(workspaces).values({ id: workspaceId, name: "Resend Inbound Test", slug: `resend-inbound-${workspaceId}`, plan: "TEST" });
    await db.insert(accounts).values({ id: accountId, workspaceId, createdBy: userId, name: "Replying Manufacturer GmbH", domain: `reply-${accountId}.example`, website: `https://reply-${accountId}.example`, country: "Germany", industry: "Automotive Components", source: "TEST" });
    await db.insert(contacts).values({ id: contactId, workspaceId, createdBy: userId, accountId, name: "Marta Weber", title: "Quality Director", email: "marta.weber@example.test", status: "ACTIVE", source: "TEST" });
    const [play] = await db.insert(plays).values({ workspaceId, createdBy: userId, name: "Reply Follow-up", status: "PUBLISHED" }).returning();
    const [version] = await db.insert(playVersions).values({ workspaceId, createdBy: userId, playId: play!.id, versionNumber: 1, status: "PUBLISHED", publishedAt: new Date(), graph: { nodes: [], edges: [] } }).returning();
    await db.update(plays).set({ activeVersionId: version!.id }).where(eq(plays.id, play!.id));
    const [outbound] = await db.insert(messages).values({
      workspaceId,
      createdBy: userId,
      accountId,
      contactId,
      direction: "OUTBOUND",
      channel: "EMAIL",
      providerMessageId: "resend-outbound-123@resend.dev",
      subject: "Inline quality inspection",
      body: "Would inline vision inspection fit your line?",
      status: "SENT",
      sentAt: new Date(),
      idempotencyKey: `resend-outbound-${workspaceId}`,
    }).returning();
    return { workspaceId, accountId, contactId, outboundMessageId: outbound!.id };
  }

  it("matches outbound by in-reply-to provider message id and creates exactly one mission", async () => {
    const fx = await fixture();
    const email = makeResendEmail({
      headers: { "in-reply-to": "<resend-outbound-123@resend.dev>" },
    });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(email), { status: 200 }));
    const missions: Array<{ workspaceId: string; missionId: string }> = [];

    const result = await processResendInboundEmail(
      { emailId: email.id },
      { fetch: fetchMock, apiKey: "re_key", workspaceId: fx.workspaceId, enqueueMission: async (job) => { missions.push(job); } },
    );

    expect(result.kind).toBe("QUEUED");
    if (result.kind !== "QUEUED") throw new Error("Expected queued result.");
    expect(result.inboundMessageId).toBeDefined();
    expect(missions).toHaveLength(1);
    expect(missions[0]).toMatchObject({ workspaceId: fx.workspaceId });

    const [inbound] = await db.select().from(messages).where(and(eq(messages.workspaceId, fx.workspaceId), eq(messages.id, result.inboundMessageId)));
    expect(inbound?.direction).toBe("INBOUND");
    expect(inbound?.inReplyToMessageId).toBe(fx.outboundMessageId);
    expect(inbound?.providerMessageId).toBe(email.id);

    const [missionCount] = await db.select({ value: count() }).from(agentMissions).where(and(eq(agentMissions.workspaceId, fx.workspaceId), eq(agentMissions.replySourceMessageId, result.inboundMessageId)));
    expect(missionCount?.value).toBe(1);
  });

  it("matches outbound by x-navo-message-id header", async () => {
    const fx = await fixture();
    const [outbound] = await db.update(messages).set({ providerMessageId: null }).where(and(eq(messages.workspaceId, fx.workspaceId), eq(messages.id, fx.outboundMessageId))).returning();
    const email = makeResendEmail({
      headers: [{ name: "X-Navo-Message-Id", value: outbound!.id }],
    });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(email), { status: 200 }));

    const result = await processResendInboundEmail(
      { emailId: email.id },
      { fetch: fetchMock, apiKey: "re_key", workspaceId: fx.workspaceId, enqueueMission: async () => {} },
    );

    expect(result.kind).toBe("QUEUED");
  });

  it("is idempotent across duplicate webhook deliveries", async () => {
    const fx = await fixture();
    const email = makeResendEmail();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(email), { status: 200 }));
    const missions: Array<{ workspaceId: string; missionId: string }> = [];

    const first = await processResendInboundEmail(
      { emailId: email.id },
      { fetch: fetchMock, apiKey: "re_key", workspaceId: fx.workspaceId, enqueueMission: async (job) => { missions.push(job); } },
    );
    const second = await processResendInboundEmail(
      { emailId: email.id },
      { fetch: fetchMock, apiKey: "re_key", workspaceId: fx.workspaceId, enqueueMission: async (job) => { missions.push(job); } },
    );

    expect(first.kind).toBe("QUEUED");
    expect(second.kind).toBe("DUPLICATE");
    if (first.kind !== "QUEUED" || second.kind !== "DUPLICATE") throw new Error("Unexpected result kinds.");
    expect(second.inboundMessageId).toBe(first.inboundMessageId);
    expect(missions).toHaveLength(1);

    const [inboundCount] = await db.select({ value: count() }).from(messages).where(and(eq(messages.workspaceId, fx.workspaceId), eq(messages.providerMessageId, email.id)));
    expect(inboundCount?.value).toBe(1);
    const [missionCount] = await db.select({ value: count() }).from(agentMissions).where(and(eq(agentMissions.workspaceId, fx.workspaceId), eq(agentMissions.replySourceMessageId, first.inboundMessageId)));
    expect(missionCount?.value).toBe(1);
  });

  it("returns NO_MATCH when headers do not reference an outbound message", async () => {
    const fx = await fixture();
    const email = makeResendEmail({ headers: [{ name: "In-Reply-To", value: "<unknown@example.com>" }] });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(email), { status: 200 }));

    const result = await processResendInboundEmail(
      { emailId: email.id },
      { fetch: fetchMock, apiKey: "re_key", workspaceId: fx.workspaceId, enqueueMission: async () => {} },
    );

    expect(result.kind).toBe("NO_MATCH");
  });
});
