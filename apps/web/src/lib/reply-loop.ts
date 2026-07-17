import { and, eq } from "drizzle-orm";
import {
  classifyReply,
  deriveMemoryFacts,
  proposeNextBestAction,
  summarizeConversation,
  type ReplyEventType,
} from "@navo/domain";
import {
  accounts,
  auditLogs,
  conversations,
  conversationSummaries,
  crmConnections,
  crmEvents,
  db,
  memoryFacts,
  messageClassifications,
  messageEvents,
  messages,
  nextActionProposals,
  nodeRuns,
  opportunityMirrors,
  plays,
  runs,
  suppressionEntries,
  tasks,
} from "@navo/db";
import { DEMO_WORKSPACE_ID } from "@navo/db/queries";

export type EmailSinkEvent = {
  eventType: ReplyEventType;
  subject?: string;
  body?: string;
  eventId?: string;
};

const stableToken = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export async function processEmailSinkEvent(messageId: string, event: EmailSinkEvent) {
  const now = new Date();
  const fingerprint = event.eventId ?? stableToken(`${event.eventType}:${event.subject ?? ""}:${event.body ?? ""}`);
  const idempotencyKey = `email-sink:${messageId}:${event.eventType}:${fingerprint}`;

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(messages).where(and(eq(messages.workspaceId, DEMO_WORKSPACE_ID), eq(messages.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) return { message: existing, duplicate: true };

    const [outbound] = await tx.select().from(messages).where(and(eq(messages.workspaceId, DEMO_WORKSPACE_ID), eq(messages.id, messageId), eq(messages.direction, "OUTBOUND"))).limit(1);
    if (!outbound) return null;

    let conversationId = outbound.conversationId;
    if (!conversationId) {
      const [created] = await tx.insert(conversations).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, accountId: outbound.accountId, contactId: outbound.contactId, subject: outbound.subject, lastMessageAt: now, unreadCount: 1 }).returning();
      if (!created) throw new Error("Conversation could not be created.");
      conversationId = created.id;
      await tx.update(messages).set({ conversationId, updatedAt: now }).where(and(eq(messages.workspaceId, DEMO_WORKSPACE_ID), eq(messages.id, outbound.id)));
    }

    const classification = classifyReply({ messageId, subject: event.subject ?? `Re: ${outbound.subject}`, body: event.body ?? "", eventType: event.eventType });
    const inboundStatus = event.eventType === "REPLY" ? "RECEIVED" : event.eventType;
    const [inbound] = await tx.insert(messages).values({
      workspaceId: DEMO_WORKSPACE_ID,
      createdBy: outbound.createdBy,
      conversationId,
      accountId: outbound.accountId,
      contactId: outbound.contactId,
      runId: outbound.runId,
      inReplyToMessageId: outbound.id,
      direction: "INBOUND",
      channel: "EMAIL",
      providerMessageId: `email-sink-${fingerprint}`,
      subject: event.subject ?? `Re: ${outbound.subject}`,
      body: event.body ?? `${event.eventType} event received by EmailSink.`,
      status: inboundStatus,
      receivedAt: now,
      replyClassification: classification.classification,
      idempotencyKey,
    }).returning();
    if (!inbound) throw new Error("Inbound message could not be created.");

    await tx.update(messages).set({ replyClassification: classification.classification, updatedAt: now }).where(and(eq(messages.workspaceId, DEMO_WORKSPACE_ID), eq(messages.id, outbound.id)));
    await tx.update(conversations).set({ lastMessageAt: now, unreadCount: 1, status: "OPEN", updatedAt: now }).where(and(eq(conversations.workspaceId, DEMO_WORKSPACE_ID), eq(conversations.id, conversationId)));
    await tx.insert(messageEvents).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, messageId: outbound.id, eventType: event.eventType === "REPLY" ? "REPLIED" : event.eventType, eventAt: now, providerEventId: fingerprint, metadata: { classification: classification.classification, confidence: classification.confidence } });
    await tx.insert(messageClassifications).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, conversationId, messageId: inbound.id, label: classification.classification, confidence: classification.confidence.toFixed(3), rationale: classification.reasons.join("; "), provider: "DETERMINISTIC", model: classification.classifierVersion });

    const summary = summarizeConversation({
      classification: classification.classification,
      messages: [
        { id: outbound.id, direction: "OUTBOUND", subject: outbound.subject, body: outbound.body, occurredAt: (outbound.sentAt ?? outbound.createdAt).toISOString() },
        { id: inbound.id, direction: "INBOUND", subject: inbound.subject, body: inbound.body, occurredAt: now.toISOString() },
      ],
    });
    await tx.insert(conversationSummaries).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, conversationId, accountId: outbound.accountId, summary: summary.summary, intent: classification.classification, questions: classification.classification === "QUESTION" ? summary.keyPoints : [], commitments: classification.classification === "POSITIVE" ? summary.keyPoints : [], updatedThroughMessageId: inbound.id }).onConflictDoUpdate({ target: [conversationSummaries.workspaceId, conversationSummaries.conversationId], set: { summary: summary.summary, intent: classification.classification, questions: classification.classification === "QUESTION" ? summary.keyPoints : [], commitments: classification.classification === "POSITIVE" ? summary.keyPoints : [], updatedThroughMessageId: inbound.id, updatedAt: now } });

    const facts = deriveMemoryFacts({ messageId: inbound.id, body: inbound.body, classification: classification.classification, confidence: classification.confidence, observedAt: now.toISOString() });
    for (const fact of facts) await tx.insert(memoryFacts).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, accountId: outbound.accountId, contactId: outbound.contactId, conversationId, category: fact.category, fact: `${fact.key}: ${fact.value}`, confidence: fact.confidence.toFixed(3), sourceType: "MESSAGE", sourceId: fact.sourceMessageId, sourceMessageId: fact.sourceMessageId, evidenceIds: [], validFrom: new Date(fact.observedAt) });

    const action = proposeNextBestAction({ messageId: inbound.id, classification: classification.classification });
    const dueAt = new Date(now.getTime() + action.dueInHours * 3_600_000);
    const [proposal] = await tx.insert(nextActionProposals).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, accountId: outbound.accountId, contactId: outbound.contactId, conversationId, sourceMessageId: inbound.id, type: action.actionType, title: action.title, rationale: action.reason, priority: action.priority, status: "ACCEPTED", dueAt }).returning();
    if (!proposal) throw new Error("Next action could not be created.");
    const [task] = await tx.insert(tasks).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, accountId: outbound.accountId, contactId: outbound.contactId, conversationId, nextActionProposalId: proposal.id, title: action.title, description: action.description, type: action.actionType, priority: action.priority, status: action.actionType === "SUPPRESS_CONTACT" ? "COMPLETED" : "OPEN", dueAt, assigneeName: "刘晓岚", completedAt: action.actionType === "SUPPRESS_CONTACT" ? now : null }).returning();
    if (!task) throw new Error("Task could not be created.");
    await tx.update(nextActionProposals).set({ acceptedTaskId: task.id, updatedAt: now }).where(eq(nextActionProposals.id, proposal.id));

    if (["UNSUBSCRIBE", "BOUNCE", "SPAM_COMPLAINT"].includes(classification.classification)) {
      const email = outbound.contactId ? (await tx.query.contacts.findFirst({ where: (contact, { and, eq }) => and(eq(contact.workspaceId, DEMO_WORKSPACE_ID), eq(contact.id, outbound.contactId!)) }))?.email : null;
      await tx.insert(suppressionEntries).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, email, reason: `EmailSink ${classification.classification}`, active: true });
    }

    const [replyPlay] = await tx.select().from(plays).where(and(eq(plays.workspaceId, DEMO_WORKSPACE_ID), eq(plays.name, "Reply Follow-up"))).limit(1);
    if (!replyPlay?.activeVersionId) throw new Error("Published Reply Follow-up play is required.");
    const [run] = await tx.insert(runs).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, playId: replyPlay.id, playVersionId: replyPlay.activeVersionId, accountId: outbound.accountId, runNumber: Math.floor(now.getTime() / 1000), trigger: "REPLY_RECEIVED", status: "COMPLETED", currentNode: "Sync CRM Mirror", startedAt: now, completedAt: now, durationMs: 420, estimatedCost: "0", ownerName: "刘晓岚", context: { conversationId, inboundMessageId: inbound.id, classification: classification.classification, testMode: true } }).returning();
    if (!run) throw new Error("Reply play run could not be created.");
    const runNodes = [
      ["reply-trigger", "Reply Received Trigger", { messageId: inbound.id }],
      ["classify", "Classify Reply", classification],
      ["summarize", "Summarize Conversation", summary],
      ["memory", "Update Memory", { facts }],
      ["next-action", "Propose Next Action", action],
      ["crm", "Sync CRM Mirror", { status: "SUCCEEDED" }],
    ] as const;
    await tx.insert(nodeRuns).values(runNodes.map(([logicalNodeId, nodeLabel, output], index) => ({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, runId: run.id, logicalNodeId, nodeLabel, status: "COMPLETED", input: { conversationId, messageId: inbound.id }, output, startedAt: now, completedAt: now, durationMs: 50 + index * 5, provider: index > 0 && index < 5 ? "deterministic" : "email-sink", model: index > 0 && index < 5 ? "DETERMINISTIC_REPLY_V1" : null, promptVersion: "v1", logs: [{ at: now.toISOString(), level: "info", message: "Validated and persisted." }] })));

    const [crm] = await tx.select().from(crmConnections).where(and(eq(crmConnections.workspaceId, DEMO_WORKSPACE_ID), eq(crmConnections.status, "CONNECTED"))).limit(1);
    if (crm) {
      const [account] = await tx.select().from(accounts).where(and(eq(accounts.workspaceId, DEMO_WORKSPACE_ID), eq(accounts.id, outbound.accountId))).limit(1);
      let [opportunity] = await tx.select().from(opportunityMirrors).where(and(eq(opportunityMirrors.workspaceId, DEMO_WORKSPACE_ID), eq(opportunityMirrors.connectionId, crm.id), eq(opportunityMirrors.accountId, outbound.accountId))).limit(1);
      if (!opportunity) [opportunity] = await tx.insert(opportunityMirrors).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, connectionId: crm.id, accountId: outbound.accountId, externalId: `email-sink-${outbound.accountId}`, name: `${account?.name ?? "Account"} — Navo Opportunity`, stage: classification.classification === "POSITIVE" ? "MEETING" : "ENGAGED", ownerName: "刘晓岚", nextStep: action.title, lastSyncedAt: now, data: { simulated: true } }).returning();
      else await tx.update(opportunityMirrors).set({ stage: classification.classification === "POSITIVE" ? "MEETING" : opportunity.stage, nextStep: action.title, lastSyncedAt: now, updatedAt: now }).where(eq(opportunityMirrors.id, opportunity.id));
      await tx.insert(crmEvents).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, connectionId: crm.id, accountId: outbound.accountId, opportunityMirrorId: opportunity?.id, eventType: "REPLY_INTELLIGENCE_SYNCED", direction: "OUTBOUND", status: "SUCCEEDED", payload: { classification: classification.classification, nextAction: action.actionType, conversationId }, occurredAt: now });
    }

    await tx.insert(auditLogs).values({ workspaceId: DEMO_WORKSPACE_ID, createdBy: outbound.createdBy, actorName: "EmailSink", action: "REPLY_LOOP_COMPLETED", resourceType: "CONVERSATION", resourceId: conversationId, requestId: fingerprint, summary: `${classification.classification} → ${action.actionType}`, metadata: { inboundMessageId: inbound.id, taskId: task.id, runId: run.id } });
    return { message: inbound, classification, summary, action, task, run, duplicate: false };
  });
}
