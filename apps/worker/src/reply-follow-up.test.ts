import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accounts,
  agentMissions,
  approvedClaims,
  contacts,
  db,
  icpProfiles,
  memoryFacts,
  messages,
  products,
  tasks,
  workspaces,
} from "@navo/db";
import { MockAIProvider } from "@navo/agents";
import { executeMissionDirect } from "./mission-runner";
import { createReplyFollowUpMission } from "./reply-follow-up";

async function createInboundReplyFixture() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  const contactId = randomUUID();
  await db.insert(workspaces).values({ id: workspaceId, name: "Reply Follow-up Test", slug: `reply-follow-up-${workspaceId}`, plan: "TEST" });
  const [product] = await db.insert(products).values({
    workspaceId,
    createdBy: userId,
    nameZh: "视觉检测",
    nameEn: "Vision Inspection",
    category: "Machine Vision",
    capabilities: ["Inline quality inspection"],
    prohibitedClaims: ["guaranteed accuracy"],
    status: "ACTIVE",
  }).returning({ id: products.id });
  await db.insert(approvedClaims).values({
    workspaceId,
    createdBy: userId,
    productId: product!.id,
    claim: "Compatible with common industrial camera interfaces.",
    approvedBy: userId,
    approvedAt: new Date(),
    allowedRegions: ["GLOBAL"],
    status: "APPROVED",
  });
  await db.insert(icpProfiles).values({
    workspaceId,
    createdBy: userId,
    name: "Industrial ICP",
    countries: ["Germany"],
    industries: ["Automotive Components"],
    hardExclusions: [],
    scoringWeights: {},
    minimumScore: 60,
  });
  await db.insert(accounts).values({
    id: accountId,
    workspaceId,
    createdBy: userId,
    name: "Replying Manufacturer GmbH",
    domain: `reply-${accountId}.example`,
    website: `https://reply-${accountId}.example`,
    country: "Germany",
    industry: "Automotive Components",
    source: "TEST",
  });
  await db.insert(contacts).values({
    id: contactId,
    workspaceId,
    createdBy: userId,
    accountId,
    name: "Marta Weber",
    title: "Quality Director",
    email: "marta.weber@example.test",
    status: "ACTIVE",
    source: "TEST",
  });
  const [inbound] = await db.insert(messages).values({
    workspaceId,
    createdBy: userId,
    accountId,
    contactId,
    direction: "INBOUND",
    channel: "EMAIL",
    subject: "Re: Inline quality inspection",
    body: "Can you share the supported line speed and camera interfaces?",
    status: "RECEIVED",
    receivedAt: new Date(),
    replyClassification: "QUESTION",
    idempotencyKey: `inbound-reply-${workspaceId}`,
  }).returning();
  return { workspaceId, accountId, contactId, inboundMessageId: inbound!.id };
}

describe("reply follow-up mission worker integration", () => {
  it("leaves a queue failure READY so the same source can be retried without a duplicate Mission", async () => {
    const fixture = await createInboundReplyFixture();
    const deferred = await createReplyFollowUpMission(
      { workspaceId: fixture.workspaceId, inboundMessageId: fixture.inboundMessageId },
      { ai: new MockAIProvider(), enqueueMission: async () => { throw new Error("redis unavailable"); } },
    );
    expect(deferred.kind).toBe("QUEUE_DEFERRED");
    if (deferred.kind !== "QUEUE_DEFERRED") throw new Error("Expected a deferred reply Mission.");
    const [ready] = await db.select().from(agentMissions).where(eq(agentMissions.id, deferred.mission.id)).limit(1);
    expect(ready?.status).toBe("READY");

    const queued: Array<{ workspaceId: string; missionId: string }> = [];
    const retried = await createReplyFollowUpMission(
      { workspaceId: fixture.workspaceId, inboundMessageId: fixture.inboundMessageId },
      { ai: new MockAIProvider(), enqueueMission: async (job) => { queued.push(job); } },
    );
    expect(retried.kind).toBe("EXISTING_AND_QUEUED");
    expect(queued).toEqual([{ workspaceId: fixture.workspaceId, missionId: deferred.mission.id }]);
    const [missionCount] = await db.select({ value: count() }).from(agentMissions).where(and(eq(agentMissions.workspaceId, fixture.workspaceId), eq(agentMissions.replySourceMessageId, fixture.inboundMessageId)));
    expect(missionCount?.value).toBe(1);
  });

  it("creates one idempotent Mission from an inbound reply, then persists only internal follow-up artifacts", async () => {
    const fixture = await createInboundReplyFixture();
    const queued: Array<{ workspaceId: string; missionId: string }> = [];
    const enqueueMission = async (input: { workspaceId: string; missionId: string }) => { queued.push(input); };

    const created = await createReplyFollowUpMission(
      { workspaceId: fixture.workspaceId, inboundMessageId: fixture.inboundMessageId },
      { ai: new MockAIProvider(), enqueueMission },
    );
    expect(created.kind).toBe("CREATED_AND_QUEUED");
    if (created.kind !== "CREATED_AND_QUEUED") throw new Error("Expected a reply follow-up Mission to be created.");
    expect(created.mission).toMatchObject({
      type: "REPLY_FOLLOW_UP",
      targetAccountId: fixture.accountId,
      approvalPolicy: "DRAFT_ONLY",
    });
    expect(created.mission.plan.steps.map((step) => step.type)).toEqual([
      "LOAD_REPLY_CONTEXT",
      "GENERATE_REPLY_DRAFT",
      "CREATE_TASK",
      "UPDATE_MEMORY",
      "SUMMARIZE_MISSION",
    ]);
    expect(queued).toEqual([{ workspaceId: fixture.workspaceId, missionId: created.mission.id }]);

    const repeated = await createReplyFollowUpMission(
      { workspaceId: fixture.workspaceId, inboundMessageId: fixture.inboundMessageId },
      { ai: new MockAIProvider(), enqueueMission },
    );
    expect(repeated).toMatchObject({ kind: "EXISTS", mission: { id: created.mission.id } });
    expect(queued).toHaveLength(1);

    await executeMissionDirect({ workspaceId: fixture.workspaceId, missionId: created.mission.id }, { ai: new MockAIProvider() });
    const [[mission], [draftCount], [sentCount], [taskCount], [memoryCount], [draft]] = await Promise.all([
      db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, fixture.workspaceId), eq(agentMissions.id, created.mission.id))).limit(1),
      db.select({ value: count() }).from(messages).where(and(eq(messages.workspaceId, fixture.workspaceId), eq(messages.missionId, created.mission.id), eq(messages.direction, "OUTBOUND"), eq(messages.status, "DRAFT"))),
      db.select({ value: count() }).from(messages).where(and(eq(messages.workspaceId, fixture.workspaceId), eq(messages.missionId, created.mission.id), eq(messages.status, "SENT"))),
      db.select({ value: count() }).from(tasks).where(and(eq(tasks.workspaceId, fixture.workspaceId), eq(tasks.missionId, created.mission.id))),
      db.select({ value: count() }).from(memoryFacts).where(and(eq(memoryFacts.workspaceId, fixture.workspaceId), eq(memoryFacts.missionId, created.mission.id), eq(memoryFacts.sourceMessageId, fixture.inboundMessageId))),
      db.select().from(messages).where(and(eq(messages.workspaceId, fixture.workspaceId), eq(messages.missionId, created.mission.id), eq(messages.direction, "OUTBOUND"))).limit(1),
    ]);
    expect(mission?.status).toBe("COMPLETED");
    expect(draftCount?.value).toBe(1);
    expect(sentCount?.value).toBe(0);
    expect(draft).toMatchObject({
      accountId: fixture.accountId,
      contactId: fixture.contactId,
      direction: "OUTBOUND",
      status: "DRAFT",
      inReplyToMessageId: fixture.inboundMessageId,
    });
    expect(taskCount?.value).toBeGreaterThan(0);
    expect(memoryCount?.value).toBeGreaterThan(0);
  }, 20_000);

  it("rejects an outbound message so a reply follow-up cannot be forged from a send candidate", async () => {
    const fixture = await createInboundReplyFixture();
    const [outbound] = await db.insert(messages).values({
      workspaceId: fixture.workspaceId,
      createdBy: randomUUID(),
      accountId: fixture.accountId,
      contactId: fixture.contactId,
      direction: "OUTBOUND",
      channel: "EMAIL",
      subject: "Draft only",
      body: "This is not an inbound reply.",
      status: "DRAFT",
      idempotencyKey: `outbound-draft-${fixture.workspaceId}`,
    }).returning();
    const result = await createReplyFollowUpMission({ workspaceId: fixture.workspaceId, inboundMessageId: outbound!.id });
    expect(result).toMatchObject({ kind: "INVALID_SOURCE_MESSAGE" });
  });
});
