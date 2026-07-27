import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accounts, contacts, conversations, db, messages, nextActionProposals, plays, playVersions, processInboundReply, tasks, workspaces } from "../src";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;

async function ensureReplyPlay(workspaceId: string, userId: string) {
  const [existing] = await db.select().from(plays).where(and(eq(plays.workspaceId, workspaceId), eq(plays.name, "Reply Follow-up"))).limit(1);
  if (existing?.activeVersionId) return existing;
  const [play] = await db.insert(plays).values({ workspaceId, createdBy: userId, name: "Reply Follow-up", status: "PUBLISHED" }).returning();
  const [version] = await db.insert(playVersions).values({ workspaceId, createdBy: userId, playId: play!.id, versionNumber: 1, status: "PUBLISHED", publishedAt: new Date(), graph: { nodes: [], edges: [] } }).returning();
  await db.update(plays).set({ activeVersionId: version!.id }).where(eq(plays.id, play!.id));
  return { ...play!, activeVersionId: version!.id };
}

describeDatabase("shared inbound reply persistence", () => {
  async function fixture() {
    const workspaceId = randomUUID();
    const userId = randomUUID();
    const accountId = randomUUID();
    const contactId = randomUUID();
    await db.insert(workspaces).values({ id: workspaceId, name: "Reply Loop Test", slug: `reply-loop-${workspaceId}`, plan: "TEST" });
    await db.insert(accounts).values({ id: accountId, workspaceId, createdBy: userId, name: "Test Manufacturer", domain: `reply-${accountId}.example`, website: `https://reply-${accountId}.example`, country: "Germany", industry: "Automotive Components", source: "TEST" });
    await db.insert(contacts).values({ id: contactId, workspaceId, createdBy: userId, accountId, name: "Test Contact", email: "contact@example.test", status: "ACTIVE", source: "TEST" });
    await ensureReplyPlay(workspaceId, userId);
    const [outbound] = await db.insert(messages).values({
      workspaceId,
      createdBy: userId,
      accountId,
      contactId,
      direction: "OUTBOUND",
      channel: "EMAIL",
      providerMessageId: `outbound-${workspaceId}`,
      subject: "Inline quality inspection",
      body: "Would inline vision inspection fit your line?",
      status: "SENT",
      sentAt: new Date(),
      idempotencyKey: `outbound-${workspaceId}`,
    }).returning();
    return { workspaceId, userId, accountId, contactId, outboundMessageId: outbound!.id };
  }

  it("creates an inbound message, task and run for a reply", async () => {
    const fx = await fixture();
    const result = await processInboundReply(fx.workspaceId, fx.outboundMessageId, {
      eventType: "REPLY",
      subject: "Re: Inline quality inspection",
      body: "Yes, let's talk.",
      providerMessageId: "inbound-1",
      providerEventId: "evt-1",
    }, { idempotencyKey: `reply-${fx.workspaceId}-1` });

    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected a result.");
    expect(result.duplicate).toBe(false);
    expect(result.message.direction).toBe("INBOUND");
    if (result.duplicate) throw new Error("Expected a new reply.");
    expect(result.task.type).toBe("PREPARE_MEETING");
    expect(result.run.trigger).toBe("REPLY_RECEIVED");

    const [conversation] = await db.select().from(conversations).where(and(eq(conversations.workspaceId, fx.workspaceId), eq(conversations.accountId, fx.accountId)));
    expect(conversation).toBeDefined();
  });

  it("is idempotent for the same idempotency key", async () => {
    const fx = await fixture();
    const idempotencyKey = `reply-${fx.workspaceId}-dup`;
    const first = await processInboundReply(fx.workspaceId, fx.outboundMessageId, { eventType: "REPLY", body: "First" }, { idempotencyKey });
    const second = await processInboundReply(fx.workspaceId, fx.outboundMessageId, { eventType: "REPLY", body: "Second replay" }, { idempotencyKey });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (!first || !second) throw new Error("Expected results.");
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(first.message.id).toBe(second.message.id);
    if (first.duplicate) throw new Error("Expected first to be new.");
    const conversationId = first.message.conversationId;
    if (!conversationId) throw new Error("Expected a conversation.");

    const [inboundCount] = await db.select({ value: count() }).from(messages).where(and(eq(messages.workspaceId, fx.workspaceId), eq(messages.idempotencyKey, idempotencyKey)));
    expect(inboundCount?.value).toBe(1);

    const [taskCount] = await db.select({ value: count() }).from(tasks).where(and(eq(tasks.workspaceId, fx.workspaceId), eq(tasks.conversationId, conversationId)));
    expect(taskCount?.value).toBe(1);

    const [proposalCount] = await db.select({ value: count() }).from(nextActionProposals).where(and(eq(nextActionProposals.workspaceId, fx.workspaceId), eq(nextActionProposals.conversationId, conversationId)));
    expect(proposalCount?.value).toBe(1);
  });

  it("returns null when the outbound message does not exist", async () => {
    const workspaceId = randomUUID();
    await db.insert(workspaces).values({ id: workspaceId, name: "Empty", slug: `empty-${workspaceId}`, plan: "TEST" });
    const result = await processInboundReply(workspaceId, randomUUID(), { eventType: "REPLY", body: "Hello" });
    expect(result).toBeNull();
  });

  it("classifies a bounce event and creates the repair delivery task", async () => {
    const fx = await fixture();
    const result = await processInboundReply(fx.workspaceId, fx.outboundMessageId, {
      eventType: "BOUNCE",
      body: "Delivery failed",
    }, { idempotencyKey: `bounce-${fx.workspaceId}` });

    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected a result.");
    expect(result.duplicate).toBe(false);
    expect(result.message.status).toBe("BOUNCE");
    if (result.duplicate) throw new Error("Expected a new reply.");
    expect(result.task.status).toBe("OPEN");
    expect(result.task.type).toBe("REPAIR_DELIVERY");
  });
});
