import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "./client";
import { accounts, agentEvents, agentMissionTargets, agentMissions, agentPlanSteps, agentPlans, agentPreferences, agentProfiles, approvals, approvedClaims, auditLogs, contacts, conversationSummaries, conversations, evidence, icpProfiles, inferences, integrationConnections, memoryFacts, messageClassifications, messageEvents, messages, nextActionProposals, nodeRuns, opportunityMirrors, personas, playVersions, plays, products, qualificationResults, runs, sequenceSteps, sequences, signals, tasks, workspaces } from "./schema";

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

export const getAccountMissionContexts = (workspaceId: string) => db
  .select({
    accountId: agentMissionTargets.accountId,
    priority: agentMissionTargets.priority,
    whySelected: agentMissionTargets.whySelected,
    currentStep: agentMissionTargets.currentStep,
    suggestedAction: agentMissionTargets.suggestedAction,
    targetStatus: agentMissionTargets.status,
    missionId: agentMissions.id,
    missionName: agentMissions.name,
    missionStatus: agentMissions.status,
    missionUpdatedAt: agentMissions.updatedAt,
  })
  .from(agentMissionTargets)
  .innerJoin(agentMissions, and(
    eq(agentMissions.workspaceId, workspaceId),
    eq(agentMissions.id, agentMissionTargets.missionId),
  ))
  .where(eq(agentMissionTargets.workspaceId, workspaceId))
  .orderBy(desc(agentMissions.updatedAt));

export async function getAccountDetail(workspaceId: string, accountId: string) {
  const [account] = await db.select().from(accounts).where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, accountId))).limit(1);
  if (!account) return null;
  const [accountEvidence, accountInferences, accountContacts, accountSignals, qualification, accountMessages, accountRuns, accountMemory, accountActions, accountTasks, opportunities, missionTargets] = await Promise.all([
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
    db.select({ target: agentMissionTargets, mission: agentMissions })
      .from(agentMissionTargets)
      .innerJoin(agentMissions, and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, agentMissionTargets.missionId)))
      .where(and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.accountId, accountId)))
      .orderBy(desc(agentMissions.updatedAt)),
  ]);
  return { account, evidence: accountEvidence, inferences: accountInferences, contacts: accountContacts, signals: accountSignals, qualification: qualification[0], messages: accountMessages, runs: accountRuns, memory: accountMemory, nextActions: accountActions, tasks: accountTasks, opportunities, missionTargets };
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
export const getApprovals = (workspaceId: string) => db.select({ approval: approvals, accountName: accounts.name, contactName: contacts.name, contactTitle: contacts.title, missionId: agentMissions.id, missionName: agentMissions.name }).from(approvals).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, approvals.accountId))).leftJoin(contacts, and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, approvals.contactId))).leftJoin(agentMissionTargets, and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.approvalId, approvals.id))).leftJoin(agentMissions, and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, agentMissionTargets.missionId))).where(eq(approvals.workspaceId, workspaceId)).orderBy(asc(approvals.status), desc(approvals.createdAt));
export async function getApproval(workspaceId: string, approvalId: string) { const [result] = await db.select({ approval: approvals, account: accounts, contact: contacts, missionId: agentMissions.id, missionName: agentMissions.name, agentRecommendation: agentMissionTargets.suggestedAction }).from(approvals).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, approvals.accountId))).leftJoin(contacts, and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, approvals.contactId))).leftJoin(agentMissionTargets, and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.approvalId, approvals.id))).leftJoin(agentMissions, and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, agentMissionTargets.missionId))).where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.id, approvalId))).limit(1); if (!result) return null; const supportingEvidence = await db.select().from(evidence).where(and(eq(evidence.workspaceId, workspaceId), eq(evidence.accountId, result.account.id))).limit(5); return { ...result, evidence: supportingEvidence }; }
export const getRuns = (workspaceId: string) => db.select({ run: runs, playName: plays.name, playVersion: playVersions.versionNumber, accountName: accounts.name }).from(runs).innerJoin(plays, and(eq(plays.workspaceId, workspaceId), eq(plays.id, runs.playId))).innerJoin(playVersions, and(eq(playVersions.workspaceId, workspaceId), eq(playVersions.id, runs.playVersionId))).leftJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, runs.accountId))).where(eq(runs.workspaceId, workspaceId)).orderBy(desc(runs.startedAt));
export async function getRun(workspaceId: string, runId: string) { const [result] = await db.select({ run: runs, playName: plays.name, playVersion: playVersions.versionNumber, accountName: accounts.name }).from(runs).innerJoin(plays, and(eq(plays.workspaceId, workspaceId), eq(plays.id, runs.playId))).innerJoin(playVersions, and(eq(playVersions.workspaceId, workspaceId), eq(playVersions.id, runs.playVersionId))).leftJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, runs.accountId))).where(and(eq(runs.workspaceId, workspaceId), eq(runs.id, runId))).limit(1); if (!result) return null; const nodes = await db.select().from(nodeRuns).where(and(eq(nodeRuns.workspaceId, workspaceId), eq(nodeRuns.runId, runId))).orderBy(asc(nodeRuns.startedAt)); return { ...result, nodes }; }
export const getSignals = (workspaceId: string) => db.select({ signal: signals, accountName: accounts.name }).from(signals).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, signals.accountId))).where(eq(signals.workspaceId, workspaceId)).orderBy(desc(signals.detectedAt));
export const getContacts = (workspaceId: string) => db.select({ contact: contacts, accountName: accounts.name }).from(contacts).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, contacts.accountId))).where(eq(contacts.workspaceId, workspaceId)).orderBy(asc(contacts.name));
export const getKnowledge = async (workspaceId: string) => ({ products: await db.select().from(products).where(eq(products.workspaceId, workspaceId)), claims: await db.select().from(approvedClaims).where(eq(approvedClaims.workspaceId, workspaceId)), personas: await db.select().from(personas).where(eq(personas.workspaceId, workspaceId)) });

export type KnowledgeClaimInput = { id?: string; claim: string; evidence?: string; allowedRegions: string[] };
export type KnowledgeBaseInput = {
  company: { name: string; website?: string; descriptionZh?: string; descriptionEn?: string };
  product: { nameZh: string; nameEn: string; category?: string; descriptionZh?: string; descriptionEn?: string; capabilities: string[]; prohibitedClaims: string[] };
  icp: { name: string; industries: string[]; countries: string[] };
  claims: KnowledgeClaimInput[];
};

type WorkspaceRow = typeof workspaces.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type IcpRow = typeof icpProfiles.$inferSelect;
type ClaimRow = typeof approvedClaims.$inferSelect;

const emptyToNull = (value?: string) => { const trimmed = value?.trim(); return trimmed ? trimmed : null; };
export const normalizeList = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

/** Pure save mapping: validated API input -> normalized row values. */
export function buildKnowledgeWrites(input: KnowledgeBaseInput) {
  return {
    workspace: { name: input.company.name.trim(), website: emptyToNull(input.company.website), descriptionZh: emptyToNull(input.company.descriptionZh), descriptionEn: emptyToNull(input.company.descriptionEn) },
    product: { nameZh: input.product.nameZh.trim(), nameEn: input.product.nameEn.trim(), category: emptyToNull(input.product.category), descriptionZh: emptyToNull(input.product.descriptionZh), descriptionEn: emptyToNull(input.product.descriptionEn), capabilities: normalizeList(input.product.capabilities), prohibitedClaims: normalizeList(input.product.prohibitedClaims) },
    icp: { name: input.icp.name.trim(), industries: normalizeList(input.icp.industries), countries: normalizeList(input.icp.countries) },
    claims: input.claims.map((claim) => ({ id: claim.id, claim: claim.claim.trim(), evidence: emptyToNull(claim.evidence), allowedRegions: normalizeList(claim.allowedRegions) })),
  };
}

/** Pure read mapping: workspace/product/ICP/claim rows -> API payload. */
export function mapKnowledgeBase({ workspace, product, icpProfile, claims }: { workspace: WorkspaceRow | null; product: ProductRow | null; icpProfile: IcpRow | null; claims: ClaimRow[] }) {
  return {
    company: workspace ? { name: workspace.name, website: workspace.website ?? "", descriptionZh: workspace.descriptionZh ?? "", descriptionEn: workspace.descriptionEn ?? "" } : null,
    product: product ? { id: product.id, nameZh: product.nameZh, nameEn: product.nameEn, category: product.category ?? "", descriptionZh: product.descriptionZh ?? "", descriptionEn: product.descriptionEn ?? "", capabilities: product.capabilities as string[], prohibitedClaims: product.prohibitedClaims as string[] } : null,
    icp: icpProfile ? { id: icpProfile.id, name: icpProfile.name, industries: icpProfile.industries as string[], countries: icpProfile.countries as string[] } : null,
    claims: claims.map((claim) => ({ id: claim.id, claim: claim.claim, evidence: claim.evidence ?? "", allowedRegions: claim.allowedRegions as string[] })),
  };
}

export async function getKnowledgeBase(workspaceId: string) {
  const [[workspace], [product], [icpProfile], claims] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
    db.select().from(products).where(and(eq(products.workspaceId, workspaceId), eq(products.status, "ACTIVE"))).orderBy(asc(products.createdAt)).limit(1),
    db.select().from(icpProfiles).where(eq(icpProfiles.workspaceId, workspaceId)).orderBy(asc(icpProfiles.createdAt)).limit(1),
    db.select().from(approvedClaims).where(and(eq(approvedClaims.workspaceId, workspaceId), eq(approvedClaims.status, "APPROVED"))).orderBy(asc(approvedClaims.createdAt)),
  ]);
  return mapKnowledgeBase({ workspace: workspace ?? null, product: product ?? null, icpProfile: icpProfile ?? null, claims });
}

export async function saveKnowledgeBase(workspaceId: string, userId: string, input: KnowledgeBaseInput) {
  const writes = buildKnowledgeWrites(input);
  await db.transaction(async (tx) => {
    const changedAt = new Date();
    await tx.update(workspaces).set({ ...writes.workspace, updatedAt: changedAt }).where(eq(workspaces.id, workspaceId));

    const [existingProduct] = await tx.select({ id: products.id }).from(products).where(and(eq(products.workspaceId, workspaceId), eq(products.status, "ACTIVE"))).orderBy(asc(products.createdAt)).limit(1);
    let productId = existingProduct?.id as string | undefined;
    if (productId) await tx.update(products).set({ ...writes.product, updatedAt: changedAt }).where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId)));
    else {
      const [inserted] = await tx.insert(products).values({ workspaceId, createdBy: userId, ...writes.product }).returning({ id: products.id });
      if (!inserted) throw new Error("Product insert did not return a row");
      productId = inserted.id;
    }

    const [existingIcp] = await tx.select({ id: icpProfiles.id }).from(icpProfiles).where(eq(icpProfiles.workspaceId, workspaceId)).orderBy(asc(icpProfiles.createdAt)).limit(1);
    if (existingIcp) await tx.update(icpProfiles).set({ ...writes.icp, updatedAt: changedAt }).where(and(eq(icpProfiles.workspaceId, workspaceId), eq(icpProfiles.id, existingIcp.id)));
    else await tx.insert(icpProfiles).values({ workspaceId, createdBy: userId, ...writes.icp });

    const existingClaims = await tx.select({ id: approvedClaims.id }).from(approvedClaims).where(and(eq(approvedClaims.workspaceId, workspaceId), eq(approvedClaims.status, "APPROVED")));
    const existingIds = new Set(existingClaims.map((claim) => claim.id));
    const keptIds = new Set(writes.claims.map((claim) => claim.id).filter((id): id is string => Boolean(id)));
    const staleIds = existingClaims.map((claim) => claim.id).filter((claimId) => !keptIds.has(claimId));
    if (staleIds.length) await tx.update(approvedClaims).set({ status: "REVOKED", updatedAt: changedAt }).where(and(eq(approvedClaims.workspaceId, workspaceId), inArray(approvedClaims.id, staleIds)));
    for (const claim of writes.claims) {
      if (claim.id && existingIds.has(claim.id)) await tx.update(approvedClaims).set({ claim: claim.claim, evidence: claim.evidence, allowedRegions: claim.allowedRegions, productId, updatedAt: changedAt }).where(and(eq(approvedClaims.workspaceId, workspaceId), eq(approvedClaims.id, claim.id)));
      else await tx.insert(approvedClaims).values({ workspaceId, createdBy: userId, productId, claim: claim.claim, evidence: claim.evidence, approvedBy: userId, approvedAt: changedAt, allowedRegions: claim.allowedRegions });
    }

    await tx.insert(auditLogs).values({ workspaceId, createdBy: userId, actorId: userId, action: "KNOWLEDGE_UPDATED", resourceType: "WORKSPACE", resourceId: workspaceId, summary: "Company, product, ICP and approved claims updated from the Knowledge page.", metadata: { claims: writes.claims.length } });
  });
  return getKnowledgeBase(workspaceId);
}
export const getIntegrations = (workspaceId: string) => db.select().from(integrationConnections).where(eq(integrationConnections.workspaceId, workspaceId)).orderBy(asc(integrationConnections.category), asc(integrationConnections.provider));

export const DEFAULT_MISSION_STEPS = [
  "Load Nova Automation product knowledge",
  "Load Industrial Automation ICP",
  "Select target accounts",
  "Research company websites",
  "Extract expansion and hiring signals",
  "Qualify accounts",
  "Select target personas",
  "Generate outreach drafts",
  "Request approval",
  "Enroll approved drafts in Test Sequence",
  "Process simulated reply",
  "Create follow-up task",
] as const;

export type CreateMissionInput = {
  name: string;
  type?: string;
  objective: string;
  desiredOutcome?: string;
  status?: "DRAFT" | "PLANNING" | "ACTIVE";
  operatingMode?: "OBSERVE" | "RECOMMEND" | "APPROVAL_CONTROLLED";
  playId?: string;
  inputSource?: string;
  approvalPolicy?: string;
  accountIds?: string[];
  targetCount?: number;
  maximumAccounts?: number;
  estimatedCostLimit?: number;
  testMode?: boolean;
  dueAt?: Date;
  targetCriteria?: Record<string, unknown>;
  stopConditions?: unknown[];
};

export async function getAgentStatus(workspaceId: string) {
  const [[profile], [preferences], activeMissions, [pendingApprovals], recentEvents] = await Promise.all([
    db.select().from(agentProfiles).where(eq(agentProfiles.workspaceId, workspaceId)).limit(1),
    db.select().from(agentPreferences).where(eq(agentPreferences.workspaceId, workspaceId)).limit(1),
    db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), inArray(agentMissions.status, ["PLANNING", "ACTIVE", "WAITING", "PAUSED"]))).orderBy(desc(agentMissions.updatedAt)),
    db.select({ value: count() }).from(approvals).where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "PENDING"))),
    db.select().from(agentEvents).where(eq(agentEvents.workspaceId, workspaceId)).orderBy(desc(agentEvents.occurredAt)).limit(20),
  ]);
  const currentMission = activeMissions.find((mission) => mission.status === "ACTIVE" || mission.status === "WAITING") ?? activeMissions[0] ?? null;
  const currentPlan = currentMission
    ? await db.select().from(agentPlanSteps).where(and(eq(agentPlanSteps.workspaceId, workspaceId), eq(agentPlanSteps.missionId, currentMission.id))).orderBy(asc(agentPlanSteps.order))
    : [];
  return { profile: profile ?? null, preferences: preferences ?? null, activeMissions, activeMissionCount: activeMissions.filter((mission) => mission.status === "ACTIVE").length, pendingApprovalCount: pendingApprovals?.value ?? 0, currentMission, currentPlan, recentEvents };
}

export async function setAgentPaused(workspaceId: string, userId: string, paused: boolean) {
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(agentProfiles).where(eq(agentProfiles.workspaceId, workspaceId)).limit(1);
    if (!profile) return null;
    const changedAt = new Date();
    const [updated] = await tx.update(agentProfiles).set({ status: paused ? "PAUSED" : "RUNNING", currentActivity: paused ? "Paused by operator" : "Monitoring active missions", lastHeartbeatAt: changedAt, updatedAt: changedAt }).where(and(eq(agentProfiles.workspaceId, workspaceId), eq(agentProfiles.id, profile.id))).returning();
    await tx.insert(agentEvents).values({ workspaceId, createdBy: userId, type: paused ? "AGENT_PAUSED" : "AGENT_RESUMED", title: paused ? "Navo was paused by the operator." : "Navo resumed monitoring missions.", severity: paused ? "WARNING" : "INFO", occurredAt: changedAt, metadata: { scope: "workspace", deterministic: true } });
    return updated ?? null;
  });
}

export const getMissions = (workspaceId: string) => db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), sql`${agentMissions.archivedAt} is null`)).orderBy(desc(agentMissions.updatedAt));

export async function getMission(workspaceId: string, missionId: string) {
  const [mission] = await db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId))).limit(1);
  if (!mission) return null;
  const [targets, plans, steps, events] = await Promise.all([
    db.select({ target: agentMissionTargets, account: accounts }).from(agentMissionTargets).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, agentMissionTargets.accountId))).where(and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.missionId, missionId))).orderBy(desc(agentMissionTargets.priority), desc(accounts.fitScore)),
    db.select().from(agentPlans).where(and(eq(agentPlans.workspaceId, workspaceId), eq(agentPlans.missionId, missionId))).orderBy(desc(agentPlans.version)),
    db.select().from(agentPlanSteps).where(and(eq(agentPlanSteps.workspaceId, workspaceId), eq(agentPlanSteps.missionId, missionId))).orderBy(asc(agentPlanSteps.order)),
    db.select().from(agentEvents).where(and(eq(agentEvents.workspaceId, workspaceId), eq(agentEvents.missionId, missionId))).orderBy(desc(agentEvents.occurredAt)),
  ]);
  return { mission, targets, plan: plans[0] ?? null, steps, events };
}

export async function createMission(workspaceId: string, userId: string, input: CreateMissionInput) {
  return db.transaction(async (tx) => {
    const requestedAccountIds = [...new Set(input.accountIds ?? [])];
    const selectedAccounts = requestedAccountIds.length
      ? await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.workspaceId, workspaceId), inArray(accounts.id, requestedAccountIds)))
      : await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.workspaceId, workspaceId)).orderBy(desc(accounts.fitScore)).limit(input.maximumAccounts ?? input.targetCount ?? 20);
    const targetCount = input.targetCount ?? input.maximumAccounts ?? selectedAccounts.length;
    const initialStatus = input.status ?? "DRAFT";
    const [mission] = await tx.insert(agentMissions).values({
      workspaceId, createdBy: userId, name: input.name, type: input.type ?? "TARGET_ACCOUNT_DISCOVERY", objective: input.objective,
      desiredOutcome: input.desiredOutcome, status: initialStatus, operatingMode: input.operatingMode ?? "APPROVAL_CONTROLLED",
      playId: input.playId, inputSource: input.inputSource ?? "DEMO_ACCOUNTS", approvalPolicy: input.approvalPolicy ?? "REQUIRED_FOR_OUTBOUND",
      targetCount, maximumAccounts: input.maximumAccounts ?? targetCount, estimatedCostLimit: input.estimatedCostLimit?.toFixed(2),
      testMode: input.testMode ?? true, dueAt: input.dueAt, targetCriteria: input.targetCriteria ?? {}, stopConditions: input.stopConditions ?? [],
      currentStep: initialStatus === "ACTIVE" ? DEFAULT_MISSION_STEPS[0] : "Plan ready for review", progress: 0,
      startedAt: initialStatus === "ACTIVE" ? new Date() : null, agentSummary: "Navo prepared a deterministic, approval-controlled execution plan.",
    }).returning();
    if (!mission) throw new Error("Mission insert did not return a row");
    const [plan] = await tx.insert(agentPlans).values({ workspaceId, createdBy: userId, missionId: mission.id, title: `${mission.name} plan`, status: initialStatus === "DRAFT" ? "DRAFT" : "ACTIVE", estimatedDurationMinutes: 90, estimatedCost: "0.04000", summary: "Evidence-backed research and controlled outbound plan." }).returning();
    if (!plan) throw new Error("Plan insert did not return a row");
    await tx.insert(agentPlanSteps).values(DEFAULT_MISSION_STEPS.map((title, index) => ({ workspaceId, createdBy: userId, missionId: mission.id, planId: plan.id, order: index + 1, title, status: initialStatus === "ACTIVE" && index === 0 ? "RUNNING" : "PENDING", relatedPlayNodeId: ["context", "icp", "target", "research", "signals", "qualify", "persona", "message", "approval", "enroll", "reply-trigger", "task"][index], input: { testMode: input.testMode ?? true }, output: {} })));
    if (selectedAccounts.length) await tx.insert(agentMissionTargets).values(selectedAccounts.map((account, index) => ({ workspaceId, createdBy: userId, missionId: mission.id, accountId: account.id, priority: index < 3 ? "HIGH" : "MEDIUM", whySelected: "Matches the selected ICP and target criteria.", currentStep: "Queued for research", status: "PENDING" })));
    await tx.insert(agentEvents).values({ workspaceId, createdBy: userId, missionId: mission.id, type: initialStatus === "ACTIVE" ? "MISSION_STARTED" : "MISSION_CREATED", title: initialStatus === "ACTIVE" ? "Navo started the mission." : "Navo prepared a mission draft.", severity: "SUCCESS", occurredAt: new Date(), metadata: { source: "deterministic-mock", targetCount } });
    return mission;
  });
}

const statusTransitions: Record<string, string[]> = {
  start: ["DRAFT", "PLANNING", "PAUSED"], pause: ["ACTIVE", "WAITING", "PLANNING"], resume: ["PAUSED"], cancel: ["DRAFT", "PLANNING", "ACTIVE", "WAITING", "PAUSED", "FAILED"],
};
const statusAfterAction: Record<string, string> = { start: "ACTIVE", pause: "PAUSED", resume: "ACTIVE", cancel: "CANCELLED" };

export async function transitionMission(workspaceId: string, userId: string, missionId: string, action: "start" | "pause" | "resume" | "cancel") {
  return db.transaction(async (tx) => {
    const [mission] = await tx.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId))).limit(1);
    if (!mission) return { kind: "NOT_FOUND" as const };
    if (!statusTransitions[action]!.includes(mission.status)) return { kind: "INVALID_TRANSITION" as const, status: mission.status };
    const nextStatus = statusAfterAction[action]!;
    const changedAt = new Date();
    const [updated] = await tx.update(agentMissions).set({ status: nextStatus, updatedAt: changedAt, startedAt: action === "start" || action === "resume" ? mission.startedAt ?? changedAt : mission.startedAt, completedAt: action === "cancel" ? changedAt : mission.completedAt, currentStep: action === "pause" ? "Paused by operator" : action === "cancel" ? "Mission cancelled" : mission.currentStep ?? DEFAULT_MISSION_STEPS[0] }).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId), eq(agentMissions.status, mission.status))).returning();
    if (!updated) return { kind: "CONFLICT" as const };
    if (action === "start" || action === "resume") await tx.update(agentPlanSteps).set({ status: "RUNNING", startedAt: changedAt, updatedAt: changedAt }).where(and(eq(agentPlanSteps.workspaceId, workspaceId), eq(agentPlanSteps.missionId, missionId), eq(agentPlanSteps.order, 1), inArray(agentPlanSteps.status, ["PENDING", "QUEUED", "WAITING"])));
    await tx.insert(agentEvents).values({ workspaceId, createdBy: userId, missionId, type: `MISSION_${action.toUpperCase()}${action === "pause" ? "D" : action === "cancel" ? "LED" : action === "resume" ? "D" : "ED"}`, title: `Mission ${nextStatus.toLowerCase()}.`, severity: action === "cancel" ? "WARNING" : "INFO", occurredAt: changedAt, metadata: { previousStatus: mission.status, nextStatus, deterministic: true } });
    return { kind: "OK" as const, mission: updated };
  });
}

export async function updateMission(workspaceId: string, missionId: string, patch: Partial<Pick<CreateMissionInput, "name" | "objective" | "desiredOutcome" | "operatingMode" | "approvalPolicy" | "dueAt" | "targetCriteria" | "stopConditions">>) {
  const [updated] = await db.update(agentMissions).set({ ...patch, updatedAt: new Date() }).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId), ne(agentMissions.status, "CANCELLED"))).returning();
  return updated ?? null;
}

export const getMissionEvents = (workspaceId: string, missionId: string) => db.select().from(agentEvents).where(and(eq(agentEvents.workspaceId, workspaceId), eq(agentEvents.missionId, missionId))).orderBy(desc(agentEvents.occurredAt));
export const getMissionPlan = async (workspaceId: string, missionId: string) => {
  const [plan] = await db.select().from(agentPlans).where(and(eq(agentPlans.workspaceId, workspaceId), eq(agentPlans.missionId, missionId))).orderBy(desc(agentPlans.version)).limit(1);
  if (!plan) return null;
  const steps = await db.select().from(agentPlanSteps).where(and(eq(agentPlanSteps.workspaceId, workspaceId), eq(agentPlanSteps.planId, plan.id))).orderBy(asc(agentPlanSteps.order));
  return { plan, steps };
};

export async function getAgentMemory(workspaceId: string, accountId?: string) {
  const [facts, workspaceProducts, workspaceIcp, claims] = await Promise.all([
    db.select({ memory: memoryFacts, accountName: accounts.name }).from(memoryFacts).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, memoryFacts.accountId))).where(and(eq(memoryFacts.workspaceId, workspaceId), eq(memoryFacts.status, "ACTIVE"), accountId ? eq(memoryFacts.accountId, accountId) : undefined)).orderBy(desc(memoryFacts.validFrom)).limit(50),
    db.select().from(products).where(and(eq(products.workspaceId, workspaceId), eq(products.status, "ACTIVE"))),
    db.select().from(icpProfiles).where(eq(icpProfiles.workspaceId, workspaceId)),
    db.select().from(approvedClaims).where(and(eq(approvedClaims.workspaceId, workspaceId), eq(approvedClaims.status, "APPROVED"))),
  ]);
  return { facts, knowledge: { products: workspaceProducts, icpProfiles: workspaceIcp, approvedClaims: claims } };
}
