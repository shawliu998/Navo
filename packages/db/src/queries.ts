import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "./client";
import { accounts, approvals, approvedClaims, auditLogs, contacts, conversationSummaries, conversations, evidence, inferences, integrationConnections, memoryFacts, messageClassifications, messageEvents, messages, nextActionProposals, nodeRuns, opportunityMirrors, personas, playVersions, plays, products, qualificationResults, runs, sequenceSteps, sequences, signals, tasks } from "./schema";

export const DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

export async function getOverview(workspaceId: string) {
  const [[accountCount], [researched], [qualified], [pending], [sent], [replies], [positive], [meetings], [openTasks], [overdueTasks], recentRuns, topPlays, recentSignals, activity] = await Promise.all([
    db.select({ value: count() }).from(accounts).where(eq(accounts.workspaceId, workspaceId)),
    db.select({ value: count() }).from(accounts).where(and(eq(accounts.workspaceId, workspaceId), sql`${accounts.lastResearchedAt} is not null`)),
    db.select({ value: count() }).from(accounts).where(and(eq(accounts.workspaceId, workspaceId), or(eq(accounts.qualification, "STRONG_FIT"), eq(accounts.qualification, "POTENTIAL_FIT")))),
    db.select({ value: count() }).from(approvals).where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "PENDING"))),
    db.select({ value: count() }).from(messages).where(and(eq(messages.workspaceId, workspaceId), eq(messages.status, "SENT"))),
    db.select({ value: count() }).from(messageEvents).where(and(eq(messageEvents.workspaceId, workspaceId), eq(messageEvents.eventType, "REPLIED"))),
    db.select({ value: count() }).from(messages).where(and(eq(messages.workspaceId, workspaceId), eq(messages.replyClassification, "POSITIVE"))),
    db.select({ value: count() }).from(messageEvents).where(and(eq(messageEvents.workspaceId, workspaceId), sql`${messageEvents.metadata}->>'meeting' = 'true'`)),
    db.select({ value: count() }).from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.status, "OPEN"))),
    db.select({ value: count() }).from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.status, "OPEN"), sql`${tasks.dueAt} < now()`)),
    db.select().from(runs).where(eq(runs.workspaceId, workspaceId)).orderBy(desc(runs.startedAt)).limit(6),
    db.select().from(plays).where(eq(plays.workspaceId, workspaceId)).orderBy(desc(plays.lastRunAt)).limit(4),
    db.select().from(signals).where(eq(signals.workspaceId, workspaceId)).orderBy(desc(signals.detectedAt)).limit(5),
    db.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId)).orderBy(desc(auditLogs.createdAt)).limit(5),
  ]);
  return { metrics: { imported: accountCount?.value ?? 0, researched: researched?.value ?? 0, qualified: qualified?.value ?? 0, pending: pending?.value ?? 0, sent: sent?.value ?? 0, replies: replies?.value ?? 0, positive: positive?.value ?? 0, meetings: meetings?.value ?? 0, openTasks: openTasks?.value ?? 0, overdueTasks: overdueTasks?.value ?? 0 }, recentRuns, topPlays, recentSignals, activity };
}

export async function getAccounts(workspaceId: string, query = "") {
  return db.select().from(accounts).where(and(eq(accounts.workspaceId, workspaceId), query ? or(ilike(accounts.name, `%${query}%`), ilike(accounts.domain, `%${query}%`)) : undefined)).orderBy(desc(accounts.fitScore), asc(accounts.name));
}

export async function getAccountDetail(workspaceId: string, accountId: string) {
  const [account] = await db.select().from(accounts).where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, accountId))).limit(1);
  if (!account) return null;
  const [accountEvidence, accountInferences, accountContacts, accountSignals, qualification, accountMessages, accountRuns, accountMemory, accountActions, accountTasks, opportunities] = await Promise.all([
    db.select().from(evidence).where(and(eq(evidence.workspaceId, workspaceId), eq(evidence.accountId, accountId))).orderBy(desc(evidence.observedAt)),
    db.select().from(inferences).where(and(eq(inferences.workspaceId, workspaceId), eq(inferences.accountId, accountId))).orderBy(desc(inferences.createdAt)),
    db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.accountId, accountId))),
    db.select().from(signals).where(and(eq(signals.workspaceId, workspaceId), eq(signals.accountId, accountId))),
    db.select().from(qualificationResults).where(and(eq(qualificationResults.workspaceId, workspaceId), eq(qualificationResults.accountId, accountId))).orderBy(desc(qualificationResults.createdAt)).limit(1),
    db.select().from(messages).where(and(eq(messages.workspaceId, workspaceId), eq(messages.accountId, accountId))).orderBy(desc(messages.createdAt)),
    db.select().from(runs).where(and(eq(runs.workspaceId, workspaceId), eq(runs.accountId, accountId))).orderBy(desc(runs.startedAt)),
    db.select().from(memoryFacts).where(and(eq(memoryFacts.workspaceId, workspaceId), eq(memoryFacts.accountId, accountId), eq(memoryFacts.status, "ACTIVE"))).orderBy(desc(memoryFacts.validFrom)),
    db.select().from(nextActionProposals).where(and(eq(nextActionProposals.workspaceId, workspaceId), eq(nextActionProposals.accountId, accountId))).orderBy(desc(nextActionProposals.createdAt)),
    db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.accountId, accountId))).orderBy(asc(tasks.status), asc(tasks.dueAt)),
    db.select().from(opportunityMirrors).where(and(eq(opportunityMirrors.workspaceId, workspaceId), eq(opportunityMirrors.accountId, accountId))).orderBy(desc(opportunityMirrors.lastSyncedAt)),
  ]);
  return { account, evidence: accountEvidence, inferences: accountInferences, contacts: accountContacts, signals: accountSignals, qualification: qualification[0], messages: accountMessages, runs: accountRuns, memory: accountMemory, nextActions: accountActions, tasks: accountTasks, opportunities };
}

export const getConversations = (workspaceId: string) => db.select({ conversation: conversations, accountName: accounts.name, contactName: contacts.name, summary: conversationSummaries.summary, intent: conversationSummaries.intent }).from(conversations).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, conversations.accountId))).leftJoin(contacts, and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, conversations.contactId))).leftJoin(conversationSummaries, and(eq(conversationSummaries.workspaceId, workspaceId), eq(conversationSummaries.conversationId, conversations.id))).where(eq(conversations.workspaceId, workspaceId)).orderBy(desc(conversations.lastMessageAt));
export async function getConversation(workspaceId: string, conversationId: string) {
  const [conversation] = await db.select({ conversation: conversations, account: accounts, contact: contacts, summary: conversationSummaries }).from(conversations).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, conversations.accountId))).leftJoin(contacts, and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, conversations.contactId))).leftJoin(conversationSummaries, and(eq(conversationSummaries.workspaceId, workspaceId), eq(conversationSummaries.conversationId, conversations.id))).where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId))).limit(1);
  if (!conversation) return null;
  const [thread, classifications, memory, actions, conversationTasks] = await Promise.all([
    db.select().from(messages).where(and(eq(messages.workspaceId, workspaceId), eq(messages.conversationId, conversationId))).orderBy(asc(messages.createdAt)),
    db.select().from(messageClassifications).where(and(eq(messageClassifications.workspaceId, workspaceId), eq(messageClassifications.conversationId, conversationId))).orderBy(desc(messageClassifications.createdAt)),
    db.select().from(memoryFacts).where(and(eq(memoryFacts.workspaceId, workspaceId), eq(memoryFacts.conversationId, conversationId))).orderBy(desc(memoryFacts.createdAt)),
    db.select().from(nextActionProposals).where(and(eq(nextActionProposals.workspaceId, workspaceId), eq(nextActionProposals.conversationId, conversationId))).orderBy(desc(nextActionProposals.createdAt)),
    db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.conversationId, conversationId))).orderBy(asc(tasks.dueAt)),
  ]);
  return { ...conversation, messages: thread, classifications, memory, actions, tasks: conversationTasks };
}
export const getTasks = (workspaceId: string) => db.select({ task: tasks, accountName: accounts.name, contactName: contacts.name }).from(tasks).leftJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, tasks.accountId))).leftJoin(contacts, and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, tasks.contactId))).where(eq(tasks.workspaceId, workspaceId)).orderBy(asc(tasks.status), asc(tasks.dueAt));
export const getEmailSinkMessages = (workspaceId: string) => db.select({ message: messages, accountName: accounts.name, contactName: contacts.name, conversationSubject: conversations.subject }).from(messages).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, messages.accountId))).leftJoin(contacts, and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, messages.contactId))).leftJoin(conversations, and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, messages.conversationId))).where(and(eq(messages.workspaceId, workspaceId), eq(messages.direction, "OUTBOUND"), eq(messages.status, "SENT"))).orderBy(desc(messages.sentAt));

export const getPlays = (workspaceId: string) => db.select().from(plays).where(eq(plays.workspaceId, workspaceId)).orderBy(desc(plays.updatedAt));
export async function getPlay(workspaceId: string, playId: string) { const [play] = await db.select().from(plays).where(and(eq(plays.workspaceId, workspaceId), eq(plays.id, playId))).limit(1); if (!play) return null; const versionId = play.draftVersionId ?? play.activeVersionId; const [version] = versionId ? await db.select().from(playVersions).where(and(eq(playVersions.workspaceId, workspaceId), eq(playVersions.id, versionId))).limit(1) : []; return { play, version }; }
export const getSequences = (workspaceId: string) => db.select().from(sequences).where(eq(sequences.workspaceId, workspaceId)).orderBy(desc(sequences.updatedAt));
export async function getSequence(workspaceId: string, sequenceId: string) { const [sequence] = await db.select().from(sequences).where(and(eq(sequences.workspaceId, workspaceId), eq(sequences.id, sequenceId))).limit(1); if (!sequence) return null; const steps = await db.select().from(sequenceSteps).where(and(eq(sequenceSteps.workspaceId, workspaceId), eq(sequenceSteps.sequenceVersionId, sequence.activeVersionId!))).orderBy(asc(sequenceSteps.position)); return { sequence, steps }; }
export const getApprovals = (workspaceId: string) => db.select({ approval: approvals, accountName: accounts.name, contactName: contacts.name, contactTitle: contacts.title }).from(approvals).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, approvals.accountId))).leftJoin(contacts, and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, approvals.contactId))).where(eq(approvals.workspaceId, workspaceId)).orderBy(asc(approvals.status), desc(approvals.createdAt));
export async function getApproval(workspaceId: string, approvalId: string) { const [result] = await db.select({ approval: approvals, account: accounts, contact: contacts }).from(approvals).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, approvals.accountId))).leftJoin(contacts, and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, approvals.contactId))).where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.id, approvalId))).limit(1); if (!result) return null; const supportingEvidence = await db.select().from(evidence).where(and(eq(evidence.workspaceId, workspaceId), eq(evidence.accountId, result.account.id))).limit(5); return { ...result, evidence: supportingEvidence }; }
export const getRuns = (workspaceId: string) => db.select({ run: runs, playName: plays.name, accountName: accounts.name }).from(runs).innerJoin(plays, and(eq(plays.workspaceId, workspaceId), eq(plays.id, runs.playId))).leftJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, runs.accountId))).where(eq(runs.workspaceId, workspaceId)).orderBy(desc(runs.startedAt));
export async function getRun(workspaceId: string, runId: string) { const [result] = await db.select({ run: runs, playName: plays.name, accountName: accounts.name }).from(runs).innerJoin(plays, and(eq(plays.workspaceId, workspaceId), eq(plays.id, runs.playId))).leftJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, runs.accountId))).where(and(eq(runs.workspaceId, workspaceId), eq(runs.id, runId))).limit(1); if (!result) return null; const nodes = await db.select().from(nodeRuns).where(and(eq(nodeRuns.workspaceId, workspaceId), eq(nodeRuns.runId, runId))).orderBy(asc(nodeRuns.startedAt)); return { ...result, nodes }; }
export const getSignals = (workspaceId: string) => db.select({ signal: signals, accountName: accounts.name }).from(signals).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, signals.accountId))).where(eq(signals.workspaceId, workspaceId)).orderBy(desc(signals.detectedAt));
export const getContacts = (workspaceId: string) => db.select({ contact: contacts, accountName: accounts.name }).from(contacts).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, contacts.accountId))).where(eq(contacts.workspaceId, workspaceId)).orderBy(asc(contacts.name));
export const getKnowledge = async (workspaceId: string) => ({ products: await db.select().from(products).where(eq(products.workspaceId, workspaceId)), claims: await db.select().from(approvedClaims).where(eq(approvedClaims.workspaceId, workspaceId)), personas: await db.select().from(personas).where(eq(personas.workspaceId, workspaceId)) });
export const getIntegrations = (workspaceId: string) => db.select().from(integrationConnections).where(eq(integrationConnections.workspaceId, workspaceId)).orderBy(asc(integrationConnections.category), asc(integrationConnections.provider));
