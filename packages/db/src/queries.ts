import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
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
  status?: "DRAFT" | "PLANNING" | "READY" | "RUNNING" | "ACTIVE";
  operatingMode?: "AUTONOMOUS" | "OBSERVE" | "RECOMMEND" | "APPROVAL_CONTROLLED";
  playId?: string;
  inputSource?: string;
  approvalPolicy?: string;
  accountIds?: string[];
  targetCount?: number;
  maximumAccounts?: number;
  maximumIterations?: number;
  estimatedCostLimit?: number;
  testMode?: boolean;
  dueAt?: Date;
  targetCriteria?: Record<string, unknown>;
  stopConditions?: unknown[];
  targetAccountId?: string;
  plan?: {
    name: string;
    missionType: string;
    objective: string;
    version: number;
    strategy: string;
    targetDescription: string;
    targetCriteria: { countries: string[]; industries: string[]; companyTypes: string[]; keywords: string[] };
    steps: Array<{ id: string; type: string; title: string; description: string; status: string; dependsOn: string[]; input?: Record<string, unknown>; output?: Record<string, unknown>; error?: string }>;
    stopConditions: string[];
    expectedOutputs: string[];
    assumptions: string[];
  };
  provider?: string;
  model?: string;
  plannerMode?: "AI" | "DETERMINISTIC_FALLBACK";
  plannerFallbackReason?: string;
  retryOfMissionId?: string;
  parentMissionId?: string;
  rootMissionId?: string;
  continuationDepth?: number;
  maximumContinuations?: number;
  autoContinue?: boolean;
};

export async function getAgentStatus(workspaceId: string) {
  const [[profile], [preferences], activeMissions, recentMissions, [pendingApprovals], recentEvents] = await Promise.all([
    db.select().from(agentProfiles).where(eq(agentProfiles.workspaceId, workspaceId)).limit(1),
    db.select().from(agentPreferences).where(eq(agentPreferences.workspaceId, workspaceId)).limit(1),
    db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), inArray(agentMissions.status, ["PLANNING", "ACTIVE", "RUNNING", "READY", "WAITING", "PAUSED"]))).orderBy(desc(agentMissions.updatedAt)),
    db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), sql`${agentMissions.archivedAt} is null`)).orderBy(desc(agentMissions.updatedAt)).limit(4),
    db.select({ value: count() }).from(approvals).where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "PENDING"))),
    db.select().from(agentEvents).where(eq(agentEvents.workspaceId, workspaceId)).orderBy(desc(agentEvents.occurredAt)).limit(20),
  ]);
  const currentMission = activeMissions.find((mission) => ["ACTIVE", "RUNNING", "WAITING"].includes(mission.status)) ?? activeMissions[0] ?? null;
  const currentPlan = currentMission
    ? await db.select().from(agentPlanSteps).where(and(eq(agentPlanSteps.workspaceId, workspaceId), eq(agentPlanSteps.missionId, currentMission.id))).orderBy(asc(agentPlanSteps.order))
    : [];
  return { profile: profile ?? null, preferences: preferences ?? null, activeMissions, recentMissions, activeMissionCount: activeMissions.filter((mission) => ["ACTIVE", "RUNNING"].includes(mission.status)).length, pendingApprovalCount: pendingApprovals?.value ?? 0, currentMission, currentPlan, recentEvents };
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
  const result = mission.result as { evidenceIds?: string[]; signalIds?: string[]; qualificationResultIds?: string[]; draftMessageIds?: string[]; taskIds?: string[]; memoryFactIds?: string[]; bestAccountId?: string | null; bestContactId?: string | null; qualification?: { id?: string }; messageId?: string };
  const evidenceIds = Array.isArray(result.evidenceIds) ? result.evidenceIds : [];
  const signalIds = Array.isArray(result.signalIds) ? result.signalIds : [];
  const qualificationIds = Array.isArray(result.qualificationResultIds) ? result.qualificationResultIds : result.qualification?.id ? [result.qualification.id] : [];
  const draftIds = Array.isArray(result.draftMessageIds) ? result.draftMessageIds : result.messageId ? [result.messageId] : [];
  const [targets, plans, steps, events, targetAccount, resultEvidence, resultSignals, resultQualifications, resultMessages, resultContacts, resultTasks, resultMemoryFacts] = await Promise.all([
    db.select({ target: agentMissionTargets, account: accounts }).from(agentMissionTargets).innerJoin(accounts, and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, agentMissionTargets.accountId))).where(and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.missionId, missionId))).orderBy(desc(agentMissionTargets.priority), desc(accounts.fitScore)),
    db.select().from(agentPlans).where(and(eq(agentPlans.workspaceId, workspaceId), eq(agentPlans.missionId, missionId))).orderBy(desc(agentPlans.version)),
    db.select().from(agentPlanSteps).where(and(eq(agentPlanSteps.workspaceId, workspaceId), eq(agentPlanSteps.missionId, missionId))).orderBy(asc(agentPlanSteps.order)),
    db.select().from(agentEvents).where(and(eq(agentEvents.workspaceId, workspaceId), eq(agentEvents.missionId, missionId))).orderBy(desc(agentEvents.occurredAt)),
    (result.bestAccountId ?? mission.targetAccountId) ? db.select().from(accounts).where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, (result.bestAccountId ?? mission.targetAccountId)!))).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
    evidenceIds.length ? db.select().from(evidence).where(and(eq(evidence.workspaceId, workspaceId), inArray(evidence.id, evidenceIds))).orderBy(desc(evidence.createdAt)) : Promise.resolve([]),
    signalIds.length ? db.select().from(signals).where(and(eq(signals.workspaceId, workspaceId), inArray(signals.id, signalIds))).orderBy(desc(signals.createdAt)) : Promise.resolve([]),
    qualificationIds.length ? db.select().from(qualificationResults).where(and(eq(qualificationResults.workspaceId, workspaceId), inArray(qualificationResults.id, qualificationIds))).orderBy(desc(qualificationResults.score)) : Promise.resolve([]),
    draftIds.length ? db.select().from(messages).where(and(eq(messages.workspaceId, workspaceId), inArray(messages.id, draftIds))).orderBy(desc(messages.createdAt)) : Promise.resolve([]),
    db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.missionId, missionId))).orderBy(desc(contacts.confidence), desc(contacts.createdAt)),
    db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.missionId, missionId))).orderBy(desc(tasks.createdAt)),
    db.select().from(memoryFacts).where(and(eq(memoryFacts.workspaceId, workspaceId), eq(memoryFacts.missionId, missionId))).orderBy(desc(memoryFacts.createdAt)),
  ]);
  return { mission, targets, plan: plans[0] ?? null, steps, events, targetAccount, resultEvidence, resultSignals, resultQualifications, resultMessages, resultContacts, bestContact: resultContacts.find((contact) => contact.id === result.bestContactId) ?? resultContacts[0] ?? null, resultQualification: resultQualifications[0] ?? null, resultMessage: resultMessages[0] ?? null, resultTasks, resultMemoryFacts };
}

type MissionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function createMissionInTransaction(tx: MissionTransaction, workspaceId: string, userId: string, input: CreateMissionInput) {
  const requestedAccountIds = [...new Set([input.targetAccountId, ...(input.accountIds ?? [])].filter((value): value is string => Boolean(value)))];
  const selectedAccounts = requestedAccountIds.length
    ? await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.workspaceId, workspaceId), inArray(accounts.id, requestedAccountIds.slice(0, input.maximumAccounts ?? 3))))
    : [];
  if (input.targetAccountId && !selectedAccounts.some((account) => account.id === input.targetAccountId)) throw new Error("MISSION_TARGET_ACCOUNT_NOT_FOUND: The selected account is outside this workspace or does not exist.");
  const targetAccountId = input.targetAccountId ?? selectedAccounts[0]?.id ?? null;
  const targetCount = input.targetCount ?? selectedAccounts.length;
  const initialStatus = input.status ?? "DRAFT";
  if (!input.plan) throw new Error("MISSION_PLAN_REQUIRED: Autonomous missions require a schema-validated plan.");
  const planSteps = input.plan.steps;
  const [mission] = await tx.insert(agentMissions).values({
    workspaceId, createdBy: userId, name: input.name, type: input.type ?? "TARGET_ACCOUNT_DISCOVERY", objective: input.objective,
    desiredOutcome: input.desiredOutcome, status: initialStatus, operatingMode: input.operatingMode ?? "AUTONOMOUS",
    playId: input.playId, inputSource: input.inputSource ?? "DEMO_ACCOUNTS", approvalPolicy: input.approvalPolicy ?? "REQUIRED_FOR_OUTBOUND",
    targetCount, maximumAccounts: input.maximumAccounts ?? Math.max(targetCount, 3), maximumIterations: input.maximumIterations ?? 20, estimatedCostLimit: input.estimatedCostLimit?.toFixed(2),
    testMode: input.testMode ?? true, dueAt: input.dueAt, targetCriteria: input.targetCriteria ?? {}, stopConditions: input.stopConditions ?? [],
    plan: input.plan, workingMemory: {}, result: {}, error: null, iteration: 0, replanCount: 0, retryOfMissionId: input.retryOfMissionId ?? null,
    parentMissionId: input.parentMissionId ?? null, rootMissionId: input.rootMissionId ?? null, continuationDepth: input.continuationDepth ?? 0,
    maximumContinuations: input.maximumContinuations ?? 0, autoContinue: input.autoContinue ?? false,
    targetAccountId, provider: input.provider, model: input.model,
    plannerMode: input.plannerMode ?? "AI", plannerFallbackReason: input.plannerFallbackReason ?? null,
    currentStep: initialStatus === "ACTIVE" || initialStatus === "RUNNING" ? planSteps[0]?.title : "Plan ready for review", progress: 0,
    startedAt: initialStatus === "ACTIVE" || initialStatus === "RUNNING" ? new Date() : null, agentSummary: input.plan ? "Navo generated a schema-validated AI mission plan." : "Navo prepared a deterministic legacy execution plan.",
  }).returning();
  if (!mission) throw new Error("Mission insert did not return a row");
  const [plan] = await tx.insert(agentPlans).values({ workspaceId, createdBy: userId, missionId: mission.id, title: `${mission.name} plan`, status: initialStatus === "DRAFT" ? "DRAFT" : "ACTIVE", estimatedDurationMinutes: 90, estimatedCost: "0.04000", summary: "Evidence-backed research and controlled outbound plan." }).returning();
  if (!plan) throw new Error("Plan insert did not return a row");
  await tx.insert(agentPlanSteps).values(planSteps.map((step, index) => ({ workspaceId, createdBy: userId, missionId: mission.id, planId: plan.id, order: index + 1, title: step.title, description: step.description, status: "PENDING", relatedPlayNodeId: step.type, input: { testMode: input.testMode ?? true, planStepId: step.id, dependsOn: step.dependsOn, ...step.input }, output: step.output ?? {} })));
  if (selectedAccounts.length) await tx.insert(agentMissionTargets).values(selectedAccounts.map((account) => ({ workspaceId, createdBy: userId, missionId: mission.id, accountId: account.id, priority: "MEDIUM", whySelected: "Provided by the operator as an initial mission candidate.", currentStep: "Plan ready for execution", status: "PENDING" })));
  await tx.insert(agentEvents).values({ workspaceId, createdBy: userId, missionId: mission.id, type: initialStatus === "ACTIVE" ? "MISSION_STARTED" : "MISSION_CREATED", title: initialStatus === "ACTIVE" ? "Navo started the mission." : "Navo prepared a mission draft.", severity: "SUCCESS", occurredAt: new Date(), metadata: { source: input.provider ?? "deterministic-legacy", targetCount, plannerMode: input.plannerMode ?? "AI", fallbackReason: input.plannerFallbackReason ?? null } });
  return mission;
}

export async function createMission(workspaceId: string, userId: string, input: CreateMissionInput) {
  return db.transaction((tx) => createMissionInTransaction(tx, workspaceId, userId, input));
}

export async function createMissionContinuation(workspaceId: string, userId: string, parentMissionId: string, input: CreateMissionInput) {
  return db.transaction(async (tx) => {
    const [parent] = await tx.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, parentMissionId))).for("update").limit(1);
    if (!parent) return { kind: "NOT_FOUND" as const };
    const [existing] = await tx.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.parentMissionId, parentMissionId))).limit(1);
    if (existing) return { kind: "EXISTS" as const, mission: existing };
    if (parent.status !== "COMPLETED") return { kind: "NOT_COMPLETED" as const, status: parent.status };
    if (!parent.autoContinue) return { kind: "DISABLED" as const };
    if (parent.continuationDepth >= parent.maximumContinuations) return { kind: "LIMIT_REACHED" as const };
    const rootMissionId = parent.rootMissionId ?? parent.id;
    const continuation = await createMissionInTransaction(tx, workspaceId, userId, {
      ...input,
      status: "READY",
      parentMissionId: parent.id,
      rootMissionId,
      continuationDepth: parent.continuationDepth + 1,
      maximumContinuations: parent.maximumContinuations,
      autoContinue: true,
    });
    const changedAt = new Date();
    await tx.insert(agentEvents).values([
      { workspaceId, createdBy: userId, missionId: parent.id, accountId: continuation.targetAccountId, type: "MISSION_CONTINUATION_CREATED", title: "Navo created the next bounded Mission.", severity: "SUCCESS", occurredAt: changedAt, metadata: { continuationMissionId: continuation.id, rootMissionId, continuationDepth: continuation.continuationDepth, maximumContinuations: continuation.maximumContinuations } },
      { workspaceId, createdBy: userId, missionId: continuation.id, accountId: continuation.targetAccountId, type: "MISSION_CONTINUATION_LINKED", title: "Mission linked to its autonomous predecessor.", severity: "INFO", occurredAt: changedAt, metadata: { parentMissionId: parent.id, rootMissionId, continuationDepth: continuation.continuationDepth, maximumContinuations: continuation.maximumContinuations } },
    ]);
    return { kind: "CREATED" as const, mission: continuation };
  });
}

export async function getPendingMissionContinuationParents(workspaceId: string) {
  const candidates = await db.select().from(agentMissions).where(and(
    eq(agentMissions.workspaceId, workspaceId),
    eq(agentMissions.status, "COMPLETED"),
    eq(agentMissions.autoContinue, true),
    sql`${agentMissions.continuationDepth} < ${agentMissions.maximumContinuations}`,
  )).orderBy(desc(agentMissions.completedAt)).limit(20);
  if (!candidates.length) return [];
  const children = await db.select({ parentMissionId: agentMissions.parentMissionId }).from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), inArray(agentMissions.parentMissionId, candidates.map((mission) => mission.id))));
  const claimedParents = new Set(children.flatMap((child) => child.parentMissionId ? [child.parentMissionId] : []));
  return candidates.filter((mission) => !claimedParents.has(mission.id));
}

const TERMINAL_MISSION_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];

/** Creates or returns the one non-terminal retry linked to a FAILED Mission. */
export async function createMissionRetry(workspaceId: string, userId: string, missionId: string) {
  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId))).for("update").limit(1);
    if (!original) return { kind: "NOT_FOUND" as const };
    if (original.status !== "FAILED") return { kind: "NOT_RETRYABLE" as const, status: original.status };
    if (original.provider !== "mock-ai" || original.model !== "deterministic-v1") return { kind: "PROVIDER_UNSUPPORTED" as const };
    const plan = original.plan as CreateMissionInput["plan"];
    if (!plan || !Array.isArray(plan.steps) || !original.targetAccountId) return { kind: "PLAN_UNAVAILABLE" as const };
    const [existing] = await tx.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.retryOfMissionId, missionId), notInArray(agentMissions.status, TERMINAL_MISSION_STATUSES))).orderBy(desc(agentMissions.updatedAt)).limit(1);
    if (existing) return { kind: "EXISTS" as const, mission: existing };
    const retry = await createMissionInTransaction(tx, workspaceId, userId, {
      name: `${original.name} (Retry)`.slice(0, 160), type: original.type, objective: original.objective,
      desiredOutcome: original.desiredOutcome ?? undefined, operatingMode: original.operatingMode as CreateMissionInput["operatingMode"],
      playId: original.playId ?? undefined, inputSource: original.inputSource, approvalPolicy: original.approvalPolicy,
      targetAccountId: original.targetAccountId, targetCount: 1, maximumAccounts: original.maximumAccounts ?? 1,
      estimatedCostLimit: original.estimatedCostLimit === null ? undefined : Number(original.estimatedCostLimit),
      testMode: original.testMode, dueAt: original.dueAt ?? undefined, targetCriteria: original.targetCriteria as Record<string, unknown>, stopConditions: original.stopConditions as unknown[],
      status: "READY", plan, provider: "mock-ai", model: "deterministic-v1", plannerMode: original.plannerMode as CreateMissionInput["plannerMode"], plannerFallbackReason: original.plannerFallbackReason ?? undefined, retryOfMissionId: original.id,
    });
    const now = new Date();
    await tx.insert(agentEvents).values([
      { workspaceId, createdBy: userId, missionId: retry.id, accountId: retry.targetAccountId, type: "MISSION_RETRIED", title: "Retry mission created from failed history.", severity: "INFO", occurredAt: now, metadata: { retryOfMissionId: original.id, noSend: true } },
      { workspaceId, createdBy: userId, missionId: original.id, accountId: original.targetAccountId, type: "MISSION_RETRY_CREATED", title: "A new retry mission was created; this failed history was preserved.", severity: "INFO", occurredAt: now, metadata: { retryMissionId: retry.id, noSend: true } },
    ]);
    await tx.insert(auditLogs).values({ workspaceId, createdBy: userId, actorId: userId, action: "MISSION_RETRY_CREATED", resourceType: "MISSION", resourceId: retry.id, summary: "Created a new Mock retry Mission; the original failed Mission was preserved.", metadata: { retryOfMissionId: original.id, noSend: true } });
    return { kind: "CREATED" as const, mission: retry };
  });
}

export async function updateMissionDraftMessage(workspaceId: string, userId: string, missionId: string, messageId: string, patch: { subject: string; body: string; revision: number }) {
  return db.transaction(async (tx) => {
    const [mission] = await tx.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId))).limit(1);
    if (!mission) return { kind: "MISSION_NOT_FOUND" as const };
    const result = mission.result as { messageId?: unknown };
    const [target] = await tx.select().from(agentMissionTargets).where(and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.missionId, missionId), eq(agentMissionTargets.messageId, messageId))).limit(1);
    if (result.messageId !== messageId && !target) return { kind: "MESSAGE_NOT_IN_MISSION" as const };
    const [message] = await tx.select().from(messages).where(and(eq(messages.workspaceId, workspaceId), eq(messages.id, messageId))).limit(1);
    if (!message) return { kind: "NOT_FOUND" as const };
    if (message.direction !== "OUTBOUND" || message.status !== "DRAFT") return { kind: "NOT_EDITABLE" as const };
    const currentRevision = message.revision;
    if (patch.revision !== currentRevision) return { kind: "CONFLICT" as const, revision: currentRevision };
    const firstEdit = message.originalSubject === null || message.originalBody === null;
    const [updated] = await tx.update(messages).set({
      subject: patch.subject,
      body: patch.body,
      originalSubject: message.originalSubject ?? message.subject,
      originalBody: message.originalBody ?? message.body,
      updatedAt: new Date(),
      revision: sql`${messages.revision} + 1`,
    }).where(and(eq(messages.workspaceId, workspaceId), eq(messages.id, messageId), eq(messages.direction, "OUTBOUND"), eq(messages.status, "DRAFT"), eq(messages.revision, patch.revision))).returning();
    if (!updated) return { kind: "CONFLICT" as const, revision: currentRevision };
    await tx.insert(auditLogs).values({
      workspaceId, createdBy: userId, actorId: userId, action: "DRAFT_MESSAGE_EDITED", resourceType: "MISSION", resourceId: missionId,
      summary: "A DRAFT outreach message was edited; no email was sent.", metadata: { messageId, firstEdit, subjectChanged: message.subject !== patch.subject, bodyChanged: message.body !== patch.body, subjectLength: patch.subject.length, bodyLength: patch.body.length, previousRevision: currentRevision, noSend: true },
    });
    return { kind: "OK" as const, message: updated, firstEdit, revision: updated.revision };
  });
}

export async function createMissionFollowUpTask(workspaceId: string, userId: string, missionId: string) {
  return db.transaction(async (tx) => {
    const [mission] = await tx.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId))).limit(1);
    if (!mission || !mission.targetAccountId) return { kind: "NOT_FOUND" as const };
    if (mission.status !== "COMPLETED") return { kind: "NOT_COMPLETED" as const };
    const [target] = await tx.select().from(agentMissionTargets).where(and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.missionId, missionId), eq(agentMissionTargets.accountId, mission.targetAccountId))).limit(1);
    if (!target) return { kind: "NOT_FOUND" as const };
    if (target.taskId) {
      const [existing] = await tx.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, target.taskId))).limit(1);
      if (existing) return { kind: "EXISTS" as const, task: existing };
      return { kind: "TASK_LINK_INVALID" as const };
    }
    const title = `Mission follow-up: ${mission.name}`;
    const description = `Created from Mission ${mission.id}.\nObjective: ${mission.objective}`;
    const taskId = crypto.randomUUID();
    const [claimed] = await tx.update(agentMissionTargets).set({ taskId, updatedAt: new Date() }).where(and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.id, target.id), isNull(agentMissionTargets.taskId))).returning({ id: agentMissionTargets.id });
    if (!claimed) {
      const [latest] = await tx.select().from(agentMissionTargets).where(and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.id, target.id))).limit(1);
      const [existing] = latest?.taskId ? await tx.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, latest.taskId))).limit(1) : [];
      return existing ? { kind: "EXISTS" as const, task: existing } : { kind: "TASK_LINK_INVALID" as const };
    }
    const [task] = await tx.insert(tasks).values({ id: taskId, workspaceId, createdBy: userId, accountId: mission.targetAccountId, title, description, type: "FOLLOW_UP", priority: "HIGH", status: "OPEN", assigneeName: "Sales Ops" }).returning();
    if (!task) throw new Error("MISSION_FOLLOW_UP_TASK_PERSIST_FAILED");
    const changedAt = new Date();
    await tx.insert(agentEvents).values({ workspaceId, createdBy: userId, missionId, accountId: mission.targetAccountId, taskId: task.id, type: "MISSION_FOLLOW_UP_TASK_CREATED", title: "Created a follow-up task from this mission.", severity: "SUCCESS", occurredAt: changedAt, metadata: { taskId: task.id, idempotent: true, noSend: true } });
    await tx.insert(auditLogs).values({ workspaceId, createdBy: userId, actorId: userId, action: "MISSION_FOLLOW_UP_TASK_CREATED", resourceType: "MISSION", resourceId: missionId, summary: "Created a follow-up task from a Mission completion brief.", metadata: { taskId: task.id, accountId: mission.targetAccountId, noSend: true } });
    return { kind: "CREATED" as const, task };
  });
}

export async function prepareMissionStart(workspaceId: string, userId: string, missionId: string) {
  return db.transaction(async (tx) => {
    const [mission] = await tx.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId))).limit(1);
    if (!mission) return { kind: "NOT_FOUND" as const };
    if (mission.status === "RUNNING") return { kind: "OK" as const, mission, alreadyRunning: true };
    if (!["DRAFT", "PLANNING", "READY"].includes(mission.status)) return { kind: "INVALID_TRANSITION" as const, status: mission.status };
    if (!mission.plan || typeof mission.plan !== "object" || !Array.isArray((mission.plan as { steps?: unknown }).steps)) return { kind: "PLAN_REQUIRED" as const };
    const changedAt = new Date();
    const [updated] = await tx.update(agentMissions).set({ status: "RUNNING", error: null, result: {}, workingMemory: {}, iteration: 0, replanCount: 0, queuedAt: changedAt, startedAt: mission.startedAt ?? changedAt, completedAt: null, progress: 0, currentStep: "Queued for autonomous execution", agentSummary: "Mission queued; Navo will select and compare target accounts autonomously.", updatedAt: changedAt }).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId), eq(agentMissions.status, mission.status))).returning();
    if (!updated) return { kind: "CONFLICT" as const };
    await tx.update(agentPlans).set({ status: "ACTIVE", updatedAt: changedAt }).where(and(eq(agentPlans.workspaceId, workspaceId), eq(agentPlans.missionId, missionId)));
    await tx.update(agentPlanSteps).set({ status: "PENDING", output: {}, errorCode: null, errorMessage: null, startedAt: null, completedAt: null, durationMs: null, updatedAt: changedAt }).where(and(eq(agentPlanSteps.workspaceId, workspaceId), eq(agentPlanSteps.missionId, missionId)));
    await tx.update(agentMissionTargets).set({ status: "QUEUED", currentStep: "Queued for autonomous execution", updatedAt: changedAt }).where(and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.missionId, missionId)));
    await tx.insert(agentEvents).values({ workspaceId, createdBy: userId, missionId, accountId: mission.targetAccountId, type: "MISSION_QUEUED", title: "Autonomous mission queued for execution.", severity: "INFO", occurredAt: changedAt, metadata: { queue: "navo-runs", jobName: "mission.execute", maximumIterations: mission.maximumIterations } });
    return { kind: "OK" as const, mission: updated, alreadyRunning: false };
  });
}

export async function failMissionQueue(workspaceId: string, userId: string, missionId: string, message: string) {
  const changedAt = new Date();
  return db.transaction(async (tx) => {
    const [mission] = await tx.update(agentMissions).set({ status: "FAILED", error: message, currentStep: "Queue submission failed", agentSummary: message, completedAt: changedAt, updatedAt: changedAt }).where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, missionId), eq(agentMissions.status, "RUNNING"))).returning();
    if (!mission) return null;
    await tx.update(agentPlans).set({ status: "FAILED", updatedAt: changedAt }).where(and(eq(agentPlans.workspaceId, workspaceId), eq(agentPlans.missionId, missionId)));
    await tx.update(agentMissionTargets).set({ status: "FAILED", currentStep: "Queue submission failed", updatedAt: changedAt }).where(and(eq(agentMissionTargets.workspaceId, workspaceId), eq(agentMissionTargets.missionId, missionId)));
    await tx.insert(agentEvents).values({ workspaceId, createdBy: userId, missionId, accountId: mission.targetAccountId, type: "MISSION_FAILED", title: "Mission could not be queued.", description: message, severity: "ERROR", status: "FAILED", occurredAt: changedAt, metadata: { stage: "QUEUE" } });
    return mission;
  });
}

const statusTransitions: Record<string, string[]> = {
  start: ["DRAFT", "PLANNING", "PAUSED"], pause: ["ACTIVE", "WAITING", "PLANNING"], resume: ["PAUSED"], cancel: ["DRAFT", "PLANNING", "READY", "RUNNING", "ACTIVE", "WAITING", "PAUSED", "FAILED"],
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
