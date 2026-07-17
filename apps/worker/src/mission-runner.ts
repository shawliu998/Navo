import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  accounts, agentEvents, agentMissions, agentMissionTargets, agentPlans, agentPlanSteps, approvedClaims, contacts, db,
  evidence, icpProfiles, memoryFacts, messages, prepareMissionStart, products, qualificationResults, signals, tasks,
  toolCalls, workspaces,
} from "@navo/db";
import {
  accountRankingOutputSchema, buildOperationInstruction, companyResearchOutputSchema, contactDiscoveryOutputSchema, DeepSeekAIProvider,
  emptyMissionWorkingMemory, getAIProvider, missionPlanSchema, missionResultSchema, missionReplanOutputSchema,
  missionWorkingMemorySchema, MockAIProvider, outreachDraftSchema, prohibitedOutreachClaims,
  qualificationOutputSchema, salesSignalOutputSchema, validateOutreachDraft,
  type AIProvider, type CompanyResearchOutput, type ContactDiscoveryOutput, type MissionPlan, type MissionResult, type MissionStepType,
  type MissionWorkingMemory, type OutreachDraft, type SalesSignalOutput,
} from "@navo/agents";
import { qualifyAccount } from "@navo/domain";
import { checkMissionStopConditions, decideNextMissionStep } from "@navo/workflows/mission-executor";
import { AgentToolRegistry, toolRecordSchema } from "@navo/workflows/tools";
import { fetchWebsiteResearch, type WebsiteResearchData, type WebsiteResearchInput, type WebsiteResearchOutput } from "@navo/workflows/website-research";
import { isLocalDemoWebsite, loadLocalWebsiteResearchFixture } from "@navo/workflows/website-research/fixture";

const fallbackUserId = "00000000-0000-4000-8000-000000000002";
type MissionRunInput = { workspaceId: string; missionId: string };
type RunnerDependencies = { ai?: AIProvider; websiteResearch?: (input: WebsiteResearchInput) => Promise<WebsiteResearchOutput>; now?: () => Date };
type AccountRow = typeof accounts.$inferSelect;
type ContactRow = typeof contacts.$inferSelect;
type SellerKnowledge = {
  companyName: string; companyDescription: string; products: string[]; capabilities: string[];
  targetIndustries: string[]; targetRegions: string[]; approvedClaims: string[]; prohibitedClaims: string[];
};
type QualificationArtifact = { id: string; accountId: string; score: number; status: string; reasons: string[]; risks: string[]; confidence: number; recommendedAction: string };
type AccountArtifact = {
  account: AccountRow; website?: WebsiteResearchData; research?: CompanyResearchOutput; evidenceIds: string[];
  signals: SalesSignalOutput["signals"]; signalIds: string[]; qualification?: QualificationArtifact; contacts: ContactRow[]; bestContact?: ContactRow;
};
type PersistedResult = Partial<MissionResult> & {
  websiteByAccount: Record<string, WebsiteResearchData>;
  researchByAccount: Record<string, CompanyResearchOutput>;
  ranking?: { rankedAccounts: Array<{ accountId: string; rank: number; reason: string }>; bestAccountId: string; recommendation: string };
  evidenceIds: string[]; signalIds: string[]; qualificationResultIds: string[]; contactIds: string[]; draftMessageIds: string[]; taskIds: string[]; memoryFactIds: string[];
  research?: CompanyResearchOutput; qualification?: QualificationArtifact; contactDiscovery?: ContactDiscoveryOutput; outreach?: OutreachDraft; messageId?: string;
};
type Runtime = {
  mission: typeof agentMissions.$inferSelect; userId: string; ai: AIProvider; now: () => Date;
  fetchResearch: (input: WebsiteResearchInput) => Promise<WebsiteResearchOutput>; plan: MissionPlan;
  memory: MissionWorkingMemory; result: PersistedResult; sellerKnowledge?: SellerKnowledge; icp?: typeof icpProfiles.$inferSelect;
  artifacts: Map<string, AccountArtifact>; consecutiveFailures: number;
};

const messageFrom = (cause: unknown) => cause instanceof Error ? cause.message : "Unknown mission execution error";
const unique = <T>(values: T[]) => [...new Set(values)];

function emptyPersistedResult(): PersistedResult {
  return { websiteByAccount: {}, researchByAccount: {}, evidenceIds: [], signalIds: [], qualificationResultIds: [], contactIds: [], draftMessageIds: [], taskIds: [], memoryFactIds: [] };
}

function persistedResult(value: unknown): PersistedResult {
  const source = value && typeof value === "object" ? value as Partial<PersistedResult> : {};
  return {
    ...emptyPersistedResult(),
    ...source,
    websiteByAccount: source.websiteByAccount ?? {},
    researchByAccount: source.researchByAccount ?? {},
    evidenceIds: source.evidenceIds ?? [],
    signalIds: source.signalIds ?? [],
    qualificationResultIds: source.qualificationResultIds ?? [],
    contactIds: source.contactIds ?? [],
    draftMessageIds: source.draftMessageIds ?? [],
    taskIds: source.taskIds ?? [],
    memoryFactIds: source.memoryFactIds ?? [],
  };
}

function providerForMission(provider: string | null, model: string | null) {
  if (provider === "mock-ai") return new MockAIProvider();
  if (provider === "deepseek") return new DeepSeekAIProvider(process.env.DEEPSEEK_API_KEY ?? "", { baseUrl: process.env.DEEPSEEK_BASE_URL, model: model ?? process.env.DEEPSEEK_MODEL });
  return getAIProvider();
}

export function validateResearchEvidence(output: CompanyResearchOutput, website: WebsiteResearchData) {
  const pages = new Map(website.pages.map((page) => [page.url, page]));
  for (const [index, item] of output.evidence.entries()) {
    const page = pages.get(item.sourceUrl);
    if (!page) throw new Error(`RESEARCH_EVIDENCE_URL_INVALID: evidence ${index + 1} references a page that was not fetched.`);
    if (!page.text.includes(item.quote)) throw new Error(`RESEARCH_EVIDENCE_QUOTE_INVALID: evidence ${index + 1} quote is not a literal substring of the fetched page.`);
  }
}

export function keepLiteralResearchEvidence(output: CompanyResearchOutput, website: WebsiteResearchData): CompanyResearchOutput {
  const pages = new Map(website.pages.map((page) => [page.url, page]));
  const evidence = output.evidence.filter((item) => pages.get(item.sourceUrl)?.text.includes(item.quote));
  if (!evidence.length) throw new Error("RESEARCH_EVIDENCE_EMPTY: No model evidence quote was a literal substring of a fetched page.");
  return evidence.length === output.evidence.length ? output : {
    ...output,
    evidence,
    uncertainties: unique([...output.uncertainties, `${output.evidence.length - evidence.length} non-literal model evidence quote(s) were discarded by deterministic validation.`]),
  };
}

export function validateSignalEvidence(output: SalesSignalOutput, validUrls: Set<string>) {
  for (const [index, signal] of output.signals.entries()) {
    if (!signal.evidenceUrls.length || signal.evidenceUrls.some((url) => !validUrls.has(url))) throw new Error(`SIGNAL_EVIDENCE_INVALID: signal ${index + 1} must reference persisted evidence URLs only.`);
  }
}

export function validateContactEvidence(output: ContactDiscoveryOutput, website: WebsiteResearchData, accountId = output.accountId) {
  if (output.accountId !== accountId) throw new Error("CONTACT_ACCOUNT_INVALID: Contact discovery returned a different account.");
  const pages = new Map(website.pages.map((page) => [page.url, page]));
  for (const [index, candidate] of output.candidates.entries()) {
    const page = pages.get(candidate.sourceUrl);
    if (!page) throw new Error(`CONTACT_SOURCE_URL_INVALID: candidate ${index + 1} references a page that was not fetched.`);
    if (!page.text.includes(candidate.sourceQuote)) throw new Error(`CONTACT_SOURCE_QUOTE_INVALID: candidate ${index + 1} quote is not a literal substring of the fetched page.`);
    if (candidate.email && !page.text.toLowerCase().includes(candidate.email.toLowerCase())) throw new Error(`CONTACT_EMAIL_UNSUPPORTED: candidate ${index + 1} email is not present on the cited page.`);
  }
}

export function keepLiteralContactEvidence(output: ContactDiscoveryOutput, website: WebsiteResearchData): ContactDiscoveryOutput {
  const pages = new Map(website.pages.map((page) => [page.url, page]));
  const candidates = output.candidates.flatMap((candidate) => {
    const page = pages.get(candidate.sourceUrl);
    if (!page?.text.includes(candidate.sourceQuote)) return [];
    if (candidate.email && !page.text.toLowerCase().includes(candidate.email.toLowerCase())) return [{ ...candidate, email: null, emailVerification: "UNKNOWN" as const }];
    return [candidate];
  });
  return { ...output, candidates, searchSummary: candidates.length === output.candidates.length ? output.searchSummary : `${output.searchSummary} Deterministic validation discarded ${output.candidates.length - candidates.length} unsupported candidate(s).` };
}

function contactScore(contact: Pick<ContactRow, "title" | "persona" | "confidence">) {
  const role = `${contact.title ?? ""} ${contact.persona ?? ""}`.toLowerCase();
  const roleScore = ["quality", "production", "automation", "engineering", "operations", "procurement"].findIndex((term) => role.includes(term));
  return Number(contact.confidence ?? 0) * 100 + (roleScore < 0 ? 0 : 20 - roleScore * 2);
}

async function defaultWebsiteResearch(input: WebsiteResearchInput): Promise<WebsiteResearchOutput> {
  if (isLocalDemoWebsite(input.websiteUrl)) return { ok: true, data: await loadLocalWebsiteResearchFixture(input.accountId, input.websiteUrl) };
  return fetchWebsiteResearch(input);
}

async function mockWebsiteResearch(input: WebsiteResearchInput): Promise<WebsiteResearchOutput> {
  return { ok: true, data: await loadLocalWebsiteResearchFixture(input.accountId, input.websiteUrl, new Date(), { allowAnyBase: true }) };
}

function isHardExcluded(account: AccountRow, exclusions: string[]) {
  if (account.suppressed) return true;
  const industry = (account.industry ?? "").toLowerCase();
  return exclusions.some((rule) => {
    const normalized = rule.toLowerCase();
    return normalized.includes("consumer") && industry.includes("consumer") || normalized.includes("service") && industry.includes("service");
  });
}

function selectionScore(account: AccountRow, criteria: MissionPlan["targetCriteria"], seller: SellerKnowledge) {
  const country = (account.country ?? "").toLowerCase();
  const industry = (account.industry ?? "").toLowerCase();
  const haystack = `${account.name} ${account.domain ?? ""} ${industry}`.toLowerCase();
  const countries = unique([...criteria.countries, ...seller.targetRegions]).map((value) => value.toLowerCase());
  const industries = unique([...criteria.industries, ...seller.targetIndustries]).map((value) => value.toLowerCase());
  return (countries.some((value) => country.includes(value) || value.includes(country)) ? 35 : 0)
    + (industries.some((value) => industry.includes(value) || value.includes(industry)) ? 35 : 0)
    + criteria.keywords.filter((value) => haystack.includes(value.toLowerCase())).length * 5
    + Math.min(account.fitScore ?? 0, 100) * 0.25;
}

async function persistRuntime(input: MissionRunInput, runtime: Runtime, currentStep: string, provider?: string, model?: string) {
  const completed = runtime.plan.steps.filter((step) => ["COMPLETED", "SKIPPED"].includes(step.status)).length;
  const progress = Math.round(completed / runtime.plan.steps.length * 100);
  await db.update(agentMissions).set({
    plan: runtime.plan, workingMemory: runtime.memory, result: runtime.result, iteration: runtime.mission.iteration, replanCount: runtime.mission.replanCount,
    progress, currentStep, agentSummary: runtime.memory.lastObservation ?? currentStep, provider: provider ?? runtime.mission.provider,
    model: model ?? runtime.mission.model, updatedAt: runtime.now(),
  }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING")));
}

async function recoverInterruptedPlan(input: MissionRunInput, runtime: Runtime) {
  const persistedSteps = await db.select().from(agentPlanSteps).where(and(eq(agentPlanSteps.workspaceId, input.workspaceId), eq(agentPlanSteps.missionId, input.missionId)));
  let changed = false;
  for (const step of runtime.plan.steps) {
    const persisted = persistedSteps.find((candidate) => (candidate.input as { planStepId?: unknown }).planStepId === step.id)
      ?? persistedSteps.find((candidate) => candidate.relatedPlayNodeId === step.type);
    if (persisted?.status === "COMPLETED" && step.status !== "COMPLETED") {
      const output = persisted.output as Record<string, unknown>;
      if (step.type === "RANK_ACCOUNTS") {
        const ranking = accountRankingOutputSchema.safeParse(output);
        if (ranking.success) {
          runtime.result.ranking = ranking.data;
          runtime.memory.rankedAccountIds = ranking.data.rankedAccounts.map((item) => item.accountId);
          runtime.memory.bestAccountId = ranking.data.bestAccountId;
        }
      }
      const recoverable = step.type === "LOAD_SELLER_KNOWLEDGE" ? Boolean(runtime.sellerKnowledge)
        : step.type === "SELECT_TARGET_ACCOUNTS" || step.type === "CREATE_TARGET_ACCOUNT" ? runtime.artifacts.size > 0
        : step.type === "FETCH_WEBSITE" ? [...runtime.artifacts.values()].some((artifact) => artifact.website)
        : step.type === "RESEARCH_COMPANY" ? [...runtime.artifacts.values()].some((artifact) => artifact.research)
        : step.type === "EXTRACT_SIGNALS" ? [...runtime.artifacts.values()].some((artifact) => artifact.signals.length)
        : step.type === "QUALIFY_ACCOUNT" ? [...runtime.artifacts.values()].some((artifact) => artifact.qualification)
        : step.type === "RANK_ACCOUNTS" ? Boolean(runtime.memory.bestAccountId)
        : step.type === "DISCOVER_CONTACTS" ? Boolean(runtime.result.contactDiscovery)
        : step.type === "GENERATE_OUTREACH" ? Boolean(runtime.result.messageId)
        : step.type === "CREATE_TASK" ? runtime.result.taskIds.length > 0
        : step.type === "UPDATE_MEMORY" ? runtime.result.memoryFactIds.length > 0
        : step.type === "SUMMARIZE_MISSION" ? Boolean(runtime.result.summary)
        : false;
      if (recoverable) {
        step.status = "COMPLETED";
        step.output = output;
        step.error = undefined;
        changed = true;
        continue;
      }
      await db.update(agentPlanSteps).set({ status: "PENDING", errorCode: null, errorMessage: null, completedAt: null, updatedAt: runtime.now() }).where(eq(agentPlanSteps.id, persisted.id));
    }
    if (step.status === "RUNNING") {
      step.status = "PENDING";
      step.error = undefined;
      changed = true;
      if (persisted) {
        await db.update(agentPlanSteps).set({ status: "PENDING", errorCode: null, errorMessage: null, completedAt: null, updatedAt: runtime.now() }).where(eq(agentPlanSteps.id, persisted.id));
      }
    }
  }
  if (changed) {
    await db.update(agentMissions).set({ plan: runtime.plan, currentStep: "Recovering interrupted mission", updatedAt: runtime.now() })
      .where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING")));
  }
}

async function hydrateRuntime(input: MissionRunInput, runtime: Runtime) {
  const [[workspace], [product], [icp], claims, targetRows] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1),
    db.select().from(products).where(and(eq(products.workspaceId, input.workspaceId), eq(products.status, "ACTIVE"))).limit(1),
    db.select().from(icpProfiles).where(eq(icpProfiles.workspaceId, input.workspaceId)).limit(1),
    db.select().from(approvedClaims).where(and(eq(approvedClaims.workspaceId, input.workspaceId), eq(approvedClaims.status, "APPROVED"))),
    db.select().from(agentMissionTargets).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId))),
  ]);
  if (workspace && product && icp) {
    runtime.icp = icp;
    runtime.sellerKnowledge = { companyName: workspace.name, companyDescription: workspace.descriptionEn ?? workspace.descriptionZh ?? "Industrial automation supplier", products: [product.nameEn], capabilities: product.capabilities as string[], targetIndustries: icp.industries as string[], targetRegions: icp.countries as string[], approvedClaims: claims.map((claim) => claim.claim), prohibitedClaims: product.prohibitedClaims as string[] };
  }

  const selectedAccountIds = unique([...runtime.memory.selectedAccountIds, ...targetRows.map((target) => target.accountId)]);
  const accountRows = selectedAccountIds.length
    ? await db.select().from(accounts).where(and(eq(accounts.workspaceId, input.workspaceId), inArray(accounts.id, selectedAccountIds)))
    : [];
  for (const account of accountRows) {
    const research = companyResearchOutputSchema.safeParse(runtime.result.researchByAccount[account.id]);
    runtime.artifacts.set(account.id, {
      account,
      website: runtime.result.websiteByAccount[account.id],
      research: research.success ? research.data : undefined,
      evidenceIds: [], signals: [], signalIds: [], contacts: [],
    });
  }
  runtime.memory.selectedAccountIds = accountRows.map((account) => account.id);
  if (accountRows.length && runtime.mission.targetCount !== accountRows.length) {
    runtime.mission.targetCount = accountRows.length;
    await db.update(agentMissions).set({ targetCount: accountRows.length, updatedAt: runtime.now() }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING")));
  }

  const [evidenceRows, signalRows, qualificationRows, contactRows, [draft], taskRows, factRows] = await Promise.all([
    db.select().from(evidence).where(and(eq(evidence.workspaceId, input.workspaceId), sql`${evidence.metadata}->>'missionId' = ${input.missionId}`)),
    db.select().from(signals).where(and(eq(signals.workspaceId, input.workspaceId), eq(signals.missionId, input.missionId))),
    db.select().from(qualificationResults).where(and(eq(qualificationResults.workspaceId, input.workspaceId), eq(qualificationResults.missionId, input.missionId))),
    db.select().from(contacts).where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.missionId, input.missionId))).orderBy(desc(contacts.confidence), desc(contacts.createdAt)),
    db.select().from(messages).where(and(eq(messages.workspaceId, input.workspaceId), eq(messages.missionId, input.missionId))).limit(1),
    db.select().from(tasks).where(and(eq(tasks.workspaceId, input.workspaceId), eq(tasks.missionId, input.missionId))),
    db.select().from(memoryFacts).where(and(eq(memoryFacts.workspaceId, input.workspaceId), eq(memoryFacts.missionId, input.missionId))),
  ]);
  for (const row of evidenceRows) runtime.artifacts.get(row.accountId)?.evidenceIds.push(row.id);
  for (const row of signalRows) {
    const artifact = runtime.artifacts.get(row.accountId);
    const parsed = salesSignalOutputSchema.safeParse({ signals: [{ type: row.type, summary: row.summary, rationale: row.rationale, evidenceUrls: row.evidenceUrls, confidence: Number(row.confidence), priority: row.priority }] });
    if (artifact && parsed.success) {
      artifact.signals.push(parsed.data.signals[0]!);
      artifact.signalIds.push(row.id);
    }
  }
  for (const row of qualificationRows) {
    const artifact = runtime.artifacts.get(row.accountId);
    if (artifact) artifact.qualification = { id: row.id, accountId: row.accountId, score: row.score, status: row.status, reasons: row.reasons as string[], risks: row.risks as string[], confidence: Number(row.confidence), recommendedAction: row.recommendedAction ?? "Review the account." };
  }
  for (const row of contactRows) runtime.artifacts.get(row.accountId)?.contacts.push(row);
  const persistedBestContactId = runtime.result.bestContactId ?? runtime.memory.bestContactId;
  for (const artifact of runtime.artifacts.values()) {
    artifact.contacts.sort((a, b) => contactScore(b) - contactScore(a));
    artifact.bestContact = artifact.contacts.find((contact) => contact.id === persistedBestContactId) ?? artifact.contacts[0];
  }

  runtime.result.evidenceIds = unique([...runtime.result.evidenceIds, ...evidenceRows.map((row) => row.id)]);
  runtime.result.signalIds = unique([...runtime.result.signalIds, ...signalRows.map((row) => row.id)]);
  runtime.result.qualificationResultIds = unique([...runtime.result.qualificationResultIds, ...qualificationRows.map((row) => row.id)]);
  runtime.result.contactIds = unique([...runtime.result.contactIds, ...contactRows.map((row) => row.id)]);
  runtime.result.draftMessageIds = unique([...runtime.result.draftMessageIds, ...(draft ? [draft.id] : [])]);
  runtime.result.taskIds = unique([...runtime.result.taskIds, ...taskRows.map((row) => row.id)]);
  runtime.result.memoryFactIds = unique([...runtime.result.memoryFactIds, ...factRows.map((row) => row.id)]);
  if (draft) runtime.result.messageId = draft.id;
  runtime.memory.evidenceIds = unique([...runtime.memory.evidenceIds, ...evidenceRows.map((row) => row.id)]);
  runtime.memory.signalIds = unique([...runtime.memory.signalIds, ...signalRows.map((row) => row.id)]);
  runtime.memory.qualificationResultIds = unique([...runtime.memory.qualificationResultIds, ...qualificationRows.map((row) => row.id)]);
  runtime.memory.contactIds = unique([...runtime.memory.contactIds, ...contactRows.map((row) => row.id)]);
  runtime.memory.draftMessageIds = unique([...runtime.memory.draftMessageIds, ...(draft ? [draft.id] : [])]);
  runtime.memory.taskIds = unique([...runtime.memory.taskIds, ...taskRows.map((row) => row.id)]);
  runtime.memory.memoryFactIds = unique([...runtime.memory.memoryFactIds, ...factRows.map((row) => row.id)]);
  runtime.memory.researchedAccountIds = unique([...runtime.memory.researchedAccountIds, ...[...runtime.artifacts.values()].filter((artifact) => artifact.research).map((artifact) => artifact.account.id)]);
  runtime.memory.qualifiedAccountIds = unique([...runtime.memory.qualifiedAccountIds, ...qualificationRows.map((row) => row.accountId)]);
  if (!runtime.memory.bestContactId) runtime.memory.bestContactId = contactRows.find((row) => row.id === persistedBestContactId)?.id ?? contactRows[0]?.id ?? null;
  if (!runtime.result.bestContactId) runtime.result.bestContactId = runtime.memory.bestContactId;
  if (!runtime.memory.bestAccountId && runtime.mission.targetAccountId && runtime.artifacts.get(runtime.mission.targetAccountId)?.qualification) runtime.memory.bestAccountId = runtime.mission.targetAccountId;
}

async function markStep(input: MissionRunInput, runtime: Runtime, stepId: string, status: "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED", output: Record<string, unknown> = {}, error?: string) {
  const step = runtime.plan.steps.find((item) => item.id === stepId);
  if (!step) throw new Error(`MISSION_PLAN_STEP_MISSING: ${stepId}`);
  step.status = status;
  step.output = output;
  step.error = error;
  const changedAt = runtime.now();
  await db.update(agentPlanSteps).set({ status, output, errorCode: error?.split(":", 1)[0]?.slice(0, 120), errorMessage: error, startedAt: status === "RUNNING" ? changedAt : undefined, completedAt: status === "RUNNING" ? null : changedAt, updatedAt: changedAt })
    .where(and(eq(agentPlanSteps.workspaceId, input.workspaceId), eq(agentPlanSteps.missionId, input.missionId), eq(agentPlanSteps.relatedPlayNodeId, step.type)));
}

async function event(input: MissionRunInput, runtime: Runtime, values: { type: string; title: string; description?: string; severity?: string; accountId?: string; metadata?: Record<string, unknown> }) {
  await db.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: runtime.userId, missionId: input.missionId, accountId: values.accountId, type: values.type, title: values.title, description: values.description, severity: values.severity ?? "INFO", occurredAt: runtime.now(), metadata: values.metadata ?? {} });
}

function createRegistry(input: MissionRunInput, runtime: Runtime) {
  const registry = new AgentToolRegistry();
  const register = (type: MissionStepType, label: string, description: string, execute: (toolInput: Record<string, unknown>) => Promise<Record<string, unknown>>) => registry.register({ type, label, description, inputSchema: toolRecordSchema, outputSchema: toolRecordSchema, execute });

  register("LOAD_SELLER_KNOWLEDGE", "Load Seller Knowledge", "Load company, product, ICP and claim context.", async () => {
    const [[workspace], [product], [icp], claims] = await Promise.all([
      db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1),
      db.select().from(products).where(and(eq(products.workspaceId, input.workspaceId), eq(products.status, "ACTIVE"))).limit(1),
      db.select().from(icpProfiles).where(eq(icpProfiles.workspaceId, input.workspaceId)).limit(1),
      db.select().from(approvedClaims).where(and(eq(approvedClaims.workspaceId, input.workspaceId), eq(approvedClaims.status, "APPROVED"))),
    ]);
    if (!workspace || !product || !icp) throw new Error("SELLER_KNOWLEDGE_INCOMPLETE: Company, product, and ICP knowledge are required.");
    runtime.icp = icp;
    runtime.sellerKnowledge = { companyName: workspace.name, companyDescription: workspace.descriptionEn ?? workspace.descriptionZh ?? "Industrial automation supplier", products: [product.nameEn], capabilities: product.capabilities as string[], targetIndustries: icp.industries as string[], targetRegions: icp.countries as string[], approvedClaims: claims.map((claim) => claim.claim), prohibitedClaims: product.prohibitedClaims as string[] };
    runtime.memory.sellerKnowledgeLoaded = true;
    runtime.memory.lastObservation = `Loaded ${runtime.sellerKnowledge.products.length} product and ${claims.length} approved claims for ${workspace.name}.`;
    return { ...runtime.sellerKnowledge, approvedClaimCount: claims.length };
  });

  register("SELECT_TARGET_ACCOUNTS", "Select Target Accounts", "Select matching workspace accounts.", async () => {
    if (!runtime.sellerKnowledge) throw new Error("SELLER_KNOWLEDGE_REQUIRED");
    const [candidates, initialTargets] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.workspaceId, input.workspaceId)).orderBy(desc(accounts.fitScore), desc(accounts.updatedAt)),
      db.select({ accountId: agentMissionTargets.accountId }).from(agentMissionTargets).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId))),
    ]);
    const maximum = Math.min(runtime.mission.maximumAccounts ?? 3, 5);
    const missionCriteria = runtime.mission.targetCriteria as { countries?: unknown; industries?: unknown };
    const criteria = { ...runtime.plan.targetCriteria, countries: unique([...runtime.plan.targetCriteria.countries, ...(Array.isArray(missionCriteria.countries) ? missionCriteria.countries.filter((value): value is string => typeof value === "string") : [])]), industries: unique([...runtime.plan.targetCriteria.industries, ...(Array.isArray(missionCriteria.industries) ? missionCriteria.industries.filter((value): value is string => typeof value === "string") : [])]) };
    const pinnedIds = unique([runtime.mission.targetAccountId, ...initialTargets.map((target) => target.accountId)].filter((value): value is string => Boolean(value)));
    const pinned = pinnedIds.map((id) => candidates.find((account) => account.id === id)).filter((account): account is AccountRow => Boolean(account?.website && !account.suppressed));
    const ranked = candidates.filter((account) => account.website && !account.suppressed).map((account) => ({ account, score: selectionScore(account, criteria, runtime.sellerKnowledge!) })).sort((a, b) => b.score - a.score);
    const selected = unique([...pinned, ...ranked.filter((item) => item.score > 20).map((item) => item.account)].map((account) => account.id)).slice(0, maximum).map((id) => candidates.find((account) => account.id === id)!);
    if (!selected.length) throw new Error("NO_TARGET_ACCOUNTS: No workspace account matched the mission and website requirements.");
    await db.insert(agentMissionTargets).values(selected.map((account, index) => ({ workspaceId: input.workspaceId, createdBy: runtime.userId, missionId: input.missionId, accountId: account.id, status: "SELECTED", priority: index === 0 ? "HIGH" : "MEDIUM", whySelected: `Matched mission criteria with selection score ${Math.round(selectionScore(account, criteria, runtime.sellerKnowledge!))}.`, currentStep: "Selected for autonomous research" }))).onConflictDoNothing();
    selected.forEach((account) => runtime.artifacts.set(account.id, { account, evidenceIds: [], signals: [], signalIds: [], contacts: [] }));
    runtime.memory.selectedAccountIds = selected.map((account) => account.id);
    runtime.mission.targetCount = selected.length;
    await db.update(agentMissions).set({ targetCount: selected.length, updatedAt: runtime.now() }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING")));
    runtime.memory.lastObservation = `Navo selected ${selected.length} accounts for comparative research.`;
    return { selectedAccounts: selected.map((account) => ({ id: account.id, name: account.name, website: account.website, country: account.country, industry: account.industry, selectionReason: `Mission criteria score ${Math.round(selectionScore(account, criteria, runtime.sellerKnowledge!))}` })) };
  });

  register("CREATE_TARGET_ACCOUNT", "Create Target Account", "Create a named account supplied with an explicit website.", async (toolInput) => {
    const name = typeof toolInput.name === "string" ? toolInput.name.trim() : "";
    const website = typeof toolInput.website === "string" ? toolInput.website.trim() : "";
    let parsedUrl: URL;
    try { parsedUrl = new URL(website); } catch { throw new Error("CREATE_ACCOUNT_WEBSITE_INVALID: An explicit HTTP(S) website is required."); }
    if (!name || !["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("CREATE_ACCOUNT_INPUT_INVALID: Name and HTTP(S) website are required.");
    const [existing] = await db.select().from(accounts).where(and(eq(accounts.workspaceId, input.workspaceId), eq(accounts.website, parsedUrl.toString()))).limit(1);
    const account = existing ?? (await db.insert(accounts).values({ workspaceId: input.workspaceId, createdBy: runtime.userId, name, website: parsedUrl.toString(), domain: parsedUrl.hostname, country: typeof toolInput.country === "string" ? toolInput.country : null, industry: typeof toolInput.industry === "string" ? toolInput.industry : null, source: "AGENT", qualification: "NOT_RESEARCHED", playStatus: "NOT_STARTED" }).returning())[0];
    if (!account) throw new Error("CREATE_ACCOUNT_PERSIST_FAILED");
    await db.insert(agentMissionTargets).values({ workspaceId: input.workspaceId, createdBy: runtime.userId, missionId: input.missionId, accountId: account.id, status: "SELECTED", priority: "HIGH", whySelected: "Explicitly named in the mission objective.", currentStep: "Created for autonomous research" }).onConflictDoNothing();
    runtime.artifacts.set(account.id, { account, evidenceIds: [], signals: [], signalIds: [], contacts: [] });
    runtime.memory.selectedAccountIds = unique([...runtime.memory.selectedAccountIds, account.id]);
    runtime.memory.lastObservation = `Created ${account.name} as an explicit mission target.`;
    return { account: { id: account.id, name: account.name, website: account.website, country: account.country, industry: account.industry } };
  });

  register("FETCH_WEBSITE", "Website Fetch", "Fetch bounded pages for selected accounts.", async () => {
    const fetched: Array<{ accountId: string; pageCount: number }> = [];
    const failures: Array<{ accountId: string; error: string }> = [];
    for (const accountId of runtime.memory.selectedAccountIds) {
      const artifact = runtime.artifacts.get(accountId);
      if (!artifact?.account.website) { failures.push({ accountId, error: "Website missing" }); continue; }
      const website = await runtime.fetchResearch({ accountId, websiteUrl: artifact.account.website });
      if (!website.ok) { failures.push({ accountId, error: `${website.error.code}: ${website.error.message}` }); continue; }
      artifact.website = website.data;
      runtime.result.websiteByAccount[accountId] = website.data;
      fetched.push({ accountId, pageCount: website.data.pages.length });
      await event(input, runtime, { type: "WEBSITE_FETCHED", title: `Fetched ${artifact.account.name}.`, accountId, severity: "SUCCESS", metadata: { pageCount: website.data.pages.length, fixture: isLocalDemoWebsite(artifact.account.website) } });
    }
    if (!fetched.length) throw new Error(`WEBSITE_RESEARCH_FAILED: ${failures.map((failure) => failure.error).join("; ")}`);
    if (failures.length && runtime.mission.replanCount < 1) {
      const remainingSteps = runtime.plan.steps.filter((step) => step.status === "PENDING");
      const replanned = await runtime.ai.generateStructured({ operation: "mission-replan", systemInstruction: buildOperationInstruction("mission-replan", "Keep the remaining registered steps and continue with accessible accounts."), input: { reason: "Some account websites were inaccessible.", remainingSteps, failedAccounts: failures, workingMemory: runtime.memory }, outputSchema: missionReplanOutputSchema, promptVersion: "mission-replan-v1", temperature: 0, maxTokens: 1_200 });
      runtime.mission.replanCount += 1;
      runtime.memory.notes.push(...replanned.data.notes, `Replanned after ${failures.length} website failure(s).`);
      await event(input, runtime, { type: "MISSION_REPLANNED", title: "Navo continued with accessible accounts.", description: replanned.data.reason, severity: "WARNING", metadata: { failedAccounts: failures.map((failure) => failure.accountId) } });
    }
    runtime.memory.lastObservation = `Fetched ${fetched.length} account websites${failures.length ? `; ${failures.length} inaccessible account(s) were skipped` : ""}.`;
    return { fetched, failures };
  });

  register("RESEARCH_COMPANY", "Research Company", "Create structured research and persist evidence.", async () => {
    if (!runtime.sellerKnowledge) throw new Error("SELLER_KNOWLEDGE_REQUIRED");
    const researched: Array<{ accountId: string; evidenceCount: number; summary: string }> = [];
    for (const artifact of runtime.artifacts.values()) {
      if (!artifact.website) continue;
      const researchInput = { accountId: artifact.account.id, companyName: artifact.account.name, website: artifact.account.website, sellerKnowledge: runtime.sellerKnowledge, pageContents: artifact.website.pages.map(({ url, title, text }) => ({ url, title, text })), evidenceUrls: artifact.website.pages.map((page) => page.url) };
      let generated = await runtime.ai.generateStructured({ operation: "company-research", systemInstruction: buildOperationInstruction("company-research", "Use only fetched pages. Every quote must be copied character-for-character as one contiguous substring from the matching page text, including punctuation and spacing. sourceUrl must equal a supplied page URL. Keep arrays concise and return no more than five evidence items."), input: researchInput, outputSchema: companyResearchOutputSchema, promptVersion: "company-research-v5", temperature: 0.1, maxTokens: 3_200 });
      try {
        validateResearchEvidence(generated.data, artifact.website);
      } catch (cause) {
        const validationError = messageFrom(cause);
        generated = await runtime.ai.generateStructured({ operation: "company-research", systemInstruction: buildOperationInstruction("company-research", "Repair the prior research output. Replace every invalid evidence quote with a short, character-for-character contiguous substring copied from the matching supplied page text. Do not paraphrase quotes or change sourceUrl. Keep no more than five evidence items."), input: { ...researchInput, previousOutput: generated.data, validationError }, outputSchema: companyResearchOutputSchema, promptVersion: "company-research-evidence-repair-v2", temperature: 0, maxTokens: 3_200 });
        generated = { ...generated, data: keepLiteralResearchEvidence(generated.data, artifact.website) };
        validateResearchEvidence(generated.data, artifact.website);
      }
      artifact.research = { ...generated.data, accountId: artifact.account.id };
      const removedIds = artifact.evidenceIds;
      if (removedIds.length) {
        await db.delete(evidence).where(and(eq(evidence.workspaceId, input.workspaceId), eq(evidence.accountId, artifact.account.id), sql`${evidence.metadata}->>'missionId' = ${input.missionId}`));
        runtime.result.evidenceIds = runtime.result.evidenceIds.filter((id) => !removedIds.includes(id));
        runtime.memory.evidenceIds = runtime.memory.evidenceIds.filter((id) => !removedIds.includes(id));
      }
      const saved = await db.insert(evidence).values(generated.data.evidence.map((item) => ({ workspaceId: input.workspaceId, createdBy: runtime.userId, accountId: artifact.account.id, type: "WEBSITE", title: item.claim, summary: item.claim, quote: item.quote, sourceUrl: item.sourceUrl, pageTitle: item.sourceTitle, observedAt: runtime.now(), fetchedAt: new Date(artifact.website!.fetchedAt), confidence: item.confidence.toFixed(3), metadata: { missionId: input.missionId, provider: generated.provider, model: generated.model } }))).returning({ id: evidence.id });
      artifact.evidenceIds = saved.map((row) => row.id);
      runtime.result.evidenceIds.push(...artifact.evidenceIds);
      runtime.result.researchByAccount[artifact.account.id] = artifact.research;
      runtime.memory.researchedAccountIds.push(artifact.account.id);
      runtime.memory.evidenceIds.push(...artifact.evidenceIds);
      await db.update(accounts).set({ summary: generated.data.summary, lastResearchedAt: runtime.now(), updatedAt: runtime.now() }).where(and(eq(accounts.workspaceId, input.workspaceId), eq(accounts.id, artifact.account.id)));
      researched.push({ accountId: artifact.account.id, evidenceCount: saved.length, summary: generated.data.summary });
    }
    if (!researched.length) throw new Error("COMPANY_RESEARCH_EMPTY: No accessible account could be researched.");
    runtime.memory.lastObservation = `Researched ${researched.length} companies and persisted ${runtime.result.evidenceIds.length} evidence records.`;
    return { researched };
  });

  register("EXTRACT_SIGNALS", "Extract Signals", "Persist evidence-linked sales opportunity signals.", async () => {
    if (!runtime.sellerKnowledge) throw new Error("SELLER_KNOWLEDGE_REQUIRED");
    const summaries: Array<{ accountId: string; signalCount: number }> = [];
    for (const artifact of runtime.artifacts.values()) {
      if (!artifact.research) continue;
      const evidenceUrls = unique(artifact.research.evidence.map((item) => item.sourceUrl));
      const generated = await runtime.ai.generateStructured({ operation: "signal-extraction", systemInstruction: buildOperationInstruction("signal-extraction", "Every signal must cite a supplied persisted evidence URL."), input: { accountId: artifact.account.id, companyResearch: artifact.research, sellerKnowledge: runtime.sellerKnowledge, evidenceUrls }, outputSchema: salesSignalOutputSchema, promptVersion: "signal-extraction-v3", temperature: 0.1, maxTokens: 1_300 });
      validateSignalEvidence(generated.data, new Set(evidenceUrls));
      if (artifact.signalIds.length) {
        await db.delete(signals).where(and(eq(signals.workspaceId, input.workspaceId), eq(signals.missionId, input.missionId), eq(signals.accountId, artifact.account.id)));
        runtime.result.signalIds = runtime.result.signalIds.filter((id) => !artifact.signalIds.includes(id));
        runtime.memory.signalIds = runtime.memory.signalIds.filter((id) => !artifact.signalIds.includes(id));
      }
      const saved = await db.insert(signals).values(generated.data.signals.map((item) => ({ workspaceId: input.workspaceId, createdBy: runtime.userId, accountId: artifact.account.id, missionId: input.missionId, type: item.type, summary: item.summary, rationale: item.rationale, evidenceUrls: item.evidenceUrls, confidence: item.confidence.toFixed(3), priority: item.priority, status: "NEW", detectedAt: runtime.now() }))).returning({ id: signals.id });
      artifact.signals = generated.data.signals;
      artifact.signalIds = saved.map((row) => row.id);
      runtime.result.signalIds.push(...artifact.signalIds);
      runtime.memory.signalIds.push(...artifact.signalIds);
      summaries.push({ accountId: artifact.account.id, signalCount: saved.length });
    }
    runtime.memory.lastObservation = `Extracted ${runtime.result.signalIds.length} evidence-linked opportunity signals.`;
    return { accounts: summaries, signalCount: runtime.result.signalIds.length };
  });

  register("QUALIFY_ACCOUNT", "Qualify Account", "Apply explainable deterministic scoring.", async () => {
    if (!runtime.sellerKnowledge || !runtime.icp) throw new Error("SELLER_KNOWLEDGE_REQUIRED");
    const qualified: QualificationArtifact[] = [];
    for (const artifact of runtime.artifacts.values()) {
      if (!artifact.research) continue;
      const semantic = await runtime.ai.generateStructured({ operation: "qualification", systemInstruction: buildOperationInstruction("qualification", "Code applies the authoritative score. Return semantic fit using supplied evidence."), input: { account: { name: artifact.account.name, country: artifact.account.country, industry: artifact.account.industry }, research: artifact.research, signals: artifact.signals, evidenceIds: artifact.evidenceIds }, outputSchema: qualificationOutputSchema, promptVersion: "qualification-v3", temperature: 0.1, maxTokens: 900 });
      const industryMatch = runtime.sellerKnowledge.targetIndustries.some((value) => (artifact.account.industry ?? "").toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes((artifact.account.industry ?? "").toLowerCase()));
      const regionMatch = runtime.sellerKnowledge.targetRegions.some((value) => value.toLowerCase() === (artifact.account.country ?? "").toLowerCase());
      const decision = qualifyAccount({ hardRules: industryMatch && regionMatch ? 100 : industryMatch || regionMatch ? 70 : 35, businessSignals: Math.min(100, 35 + artifact.signals.length * 20), productMatch: artifact.research.likelyNeeds.length || artifact.research.likelyBusinessNeeds.length ? 90 : 45, similarCaseMatch: artifact.evidenceIds.length >= 2 ? 80 : 50, semanticJudgment: semantic.data.score, hardExcluded: isHardExcluded(artifact.account, runtime.icp.hardExclusions as string[]), evidenceIds: artifact.evidenceIds });
      const reasons = decision.status === "DISQUALIFIED" ? [decision.explanation] : [decision.explanation, ...semantic.data.reasons];
      const recommendedAction = decision.score >= 60 ? "Compare the opportunity and prepare a tailored draft." : "Keep in research backlog unless stronger evidence appears.";
      if (artifact.qualification) {
        await db.delete(qualificationResults).where(and(eq(qualificationResults.workspaceId, input.workspaceId), eq(qualificationResults.missionId, input.missionId), eq(qualificationResults.accountId, artifact.account.id)));
        runtime.result.qualificationResultIds = runtime.result.qualificationResultIds.filter((id) => id !== artifact.qualification!.id);
        runtime.memory.qualificationResultIds = runtime.memory.qualificationResultIds.filter((id) => id !== artifact.qualification!.id);
      }
      const [saved] = await db.insert(qualificationResults).values({ workspaceId: input.workspaceId, createdBy: runtime.userId, accountId: artifact.account.id, missionId: input.missionId, score: decision.score, status: decision.status, scoreBreakdown: decision.scoreBreakdown, reasons, risks: semantic.data.risks, evidenceIds: artifact.evidenceIds, inferenceIds: [], recommendedAction, confidence: semantic.data.confidence.toFixed(3) }).returning({ id: qualificationResults.id });
      if (!saved) throw new Error("QUALIFICATION_PERSIST_FAILED");
      artifact.qualification = { id: saved.id, accountId: artifact.account.id, score: decision.score, status: decision.status, reasons, risks: semantic.data.risks, confidence: semantic.data.confidence, recommendedAction };
      qualified.push(artifact.qualification);
      runtime.result.qualificationResultIds.push(saved.id);
      runtime.memory.qualificationResultIds.push(saved.id);
      runtime.memory.qualifiedAccountIds.push(artifact.account.id);
      await db.update(accounts).set({ fitScore: decision.score, qualification: decision.status, updatedAt: runtime.now() }).where(and(eq(accounts.workspaceId, input.workspaceId), eq(accounts.id, artifact.account.id)));
      await db.update(agentMissionTargets).set({ status: "QUALIFIED", keySignal: artifact.signals[0]?.summary, findingConfidence: semantic.data.confidence.toFixed(3), suggestedAction: recommendedAction, currentStep: "Qualification complete", updatedAt: runtime.now() }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId), eq(agentMissionTargets.accountId, artifact.account.id)));
    }
    if (!qualified.length) throw new Error("QUALIFICATION_EMPTY: No researched account could be qualified.");
    runtime.memory.lastObservation = `Qualified ${qualified.length} accounts; ${qualified.filter((item) => item.score >= 60).length} met the follow-up threshold.`;
    return { qualifications: qualified };
  });

  register("RANK_ACCOUNTS", "Rank Accounts", "Select the strongest account using persisted comparisons.", async () => {
    const candidates = [...runtime.artifacts.values()].filter((artifact) => artifact.qualification).map((artifact) => ({ accountId: artifact.account.id, qualificationScore: artifact.qualification!.score, qualificationStatus: artifact.qualification!.status, signals: artifact.signals, summary: artifact.research?.summary ?? "" }));
    if (!candidates.length) throw new Error("RANKING_EMPTY: No qualified account is available.");
    const generated = await runtime.ai.generateStructured({ operation: "rank-accounts", systemInstruction: buildOperationInstruction("rank-accounts", "Select bestAccountId only from the supplied accounts."), input: { accounts: candidates }, outputSchema: accountRankingOutputSchema, promptVersion: "rank-accounts-v1", temperature: 0.1, maxTokens: 1_000 });
    if (!candidates.some((candidate) => candidate.accountId === generated.data.bestAccountId)) throw new Error("RANKING_ACCOUNT_INVALID");
    runtime.result.ranking = generated.data;
    runtime.memory.rankedAccountIds = generated.data.rankedAccounts.map((item) => item.accountId);
    runtime.memory.bestAccountId = generated.data.bestAccountId;
    runtime.mission.targetAccountId = generated.data.bestAccountId;
    runtime.memory.lastObservation = `Navo selected ${runtime.artifacts.get(generated.data.bestAccountId)?.account.name ?? "the top account"} as the strongest opportunity.`;
    await db.update(agentMissions).set({ targetAccountId: generated.data.bestAccountId, updatedAt: runtime.now() }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId)));
    await db.update(agentMissionTargets).set({ priority: "HIGH", suggestedAction: "Review the English outreach draft", currentStep: "Selected as best account", updatedAt: runtime.now() }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId), eq(agentMissionTargets.accountId, generated.data.bestAccountId)));
    return generated.data;
  });

  register("DISCOVER_CONTACTS", "Discover Contacts", "Find named, evidence-backed decision makers for the best account.", async () => {
    if (!runtime.memory.bestAccountId) throw new Error("BEST_ACCOUNT_REQUIRED");
    const artifact = runtime.artifacts.get(runtime.memory.bestAccountId);
    if (!artifact?.website) throw new Error("BEST_ACCOUNT_WEBSITE_REQUIRED");

    if (!artifact.contacts.length) {
      const focusedResearch = artifact.account.website
        ? await runtime.fetchResearch({ accountId: artifact.account.id, websiteUrl: artifact.account.website, focus: "CONTACTS" })
        : null;
      const contactWebsite = focusedResearch?.ok ? focusedResearch.data : artifact.website;
      const discoveryInput = {
        accountId: artifact.account.id,
        companyName: artifact.account.name,
        website: artifact.account.website,
        targetDepartments: ["QUALITY", "PRODUCTION", "AUTOMATION", "ENGINEERING", "OPERATIONS", "PROCUREMENT"],
        pageContents: contactWebsite.pages.map(({ url, title, text }) => ({ url, title, text })),
        evidenceUrls: contactWebsite.pages.map((page) => page.url),
      };
      let generated = await runtime.ai.generateStructured({ operation: "contact-discovery", systemInstruction: buildOperationInstruction("contact-discovery", "Find only people explicitly named with a job title or responsibility in the supplied pages. Copy a short literal sourceQuote containing the name and role. Return null email unless the exact address appears on the cited page."), input: discoveryInput, outputSchema: contactDiscoveryOutputSchema, promptVersion: "contact-discovery-v1", temperature: 0.1, maxTokens: 1_500 });
      try {
        validateContactEvidence(generated.data, contactWebsite, artifact.account.id);
      } catch (cause) {
        generated = await runtime.ai.generateStructured({ operation: "contact-discovery", systemInstruction: buildOperationInstruction("contact-discovery", "Repair the previous output. Remove unsupported candidates and emails. Every remaining sourceQuote must be copied character-for-character from the matching supplied page and include the person's name and role."), input: { ...discoveryInput, previousOutput: generated.data, validationError: messageFrom(cause) }, outputSchema: contactDiscoveryOutputSchema, promptVersion: "contact-discovery-repair-v1", temperature: 0, maxTokens: 1_500 });
        generated = { ...generated, data: keepLiteralContactEvidence(generated.data, contactWebsite) };
        validateContactEvidence(generated.data, contactWebsite, artifact.account.id);
      }
      runtime.result.contactDiscovery = generated.data;
      if (generated.data.candidates.length) {
        artifact.contacts = await db.insert(contacts).values(generated.data.candidates.map((candidate) => ({
          workspaceId: input.workspaceId,
          createdBy: runtime.userId,
          accountId: artifact.account.id,
          missionId: input.missionId,
          name: candidate.fullName,
          title: candidate.jobTitle,
          persona: candidate.department,
          email: candidate.email,
          emailVerification: candidate.email ? "PUBLIC" : candidate.emailVerification,
          status: "NEW",
          source: "WEBSITE_RESEARCH",
          sourceUrl: candidate.sourceUrl,
          sourceQuote: candidate.sourceQuote,
          confidence: candidate.confidence.toFixed(3),
        }))).returning();
      }
    } else if (!runtime.result.contactDiscovery) {
      runtime.result.contactDiscovery = contactDiscoveryOutputSchema.parse({
        accountId: artifact.account.id,
        candidates: artifact.contacts.map((contact) => ({ fullName: contact.name, jobTitle: contact.title ?? "Public company contact", department: contact.persona ?? "OTHER", sourceUrl: contact.sourceUrl, sourceQuote: contact.sourceQuote, confidence: Number(contact.confidence ?? 0), email: contact.email, emailVerification: contact.emailVerification, rationale: "Recovered from the persisted mission contact record." })),
        searchSummary: `Recovered ${artifact.contacts.length} persisted evidence-backed contact(s).`,
      });
    }

    artifact.contacts.sort((a, b) => contactScore(b) - contactScore(a));
    artifact.bestContact = artifact.contacts[0];
    runtime.result.contactIds = unique([...runtime.result.contactIds, ...artifact.contacts.map((contact) => contact.id)]);
    runtime.memory.contactIds = unique([...runtime.memory.contactIds, ...artifact.contacts.map((contact) => contact.id)]);
    runtime.memory.bestContactId = artifact.bestContact?.id ?? null;
    runtime.result.bestContactId = artifact.bestContact?.id ?? null;
    runtime.memory.lastObservation = artifact.bestContact
      ? `Found ${artifact.contacts.length} evidence-backed contact(s); selected ${artifact.bestContact.name}, ${artifact.bestContact.title ?? "public contact"}.`
      : `No named decision maker was supported by the fetched public pages for ${artifact.account.name}; outreach will remain account-level.`;
    return { accountId: artifact.account.id, contactIds: artifact.contacts.map((contact) => contact.id), bestContactId: artifact.bestContact?.id ?? null, searchSummary: runtime.result.contactDiscovery?.searchSummary ?? runtime.memory.lastObservation };
  });

  register("GENERATE_OUTREACH", "Generate Outreach", "Save an English outreach DRAFT for the best account.", async () => {
    if (!runtime.sellerKnowledge || !runtime.memory.bestAccountId) throw new Error("BEST_ACCOUNT_REQUIRED");
    const artifact = runtime.artifacts.get(runtime.memory.bestAccountId);
    if (!artifact?.research || !artifact.qualification) throw new Error("BEST_ACCOUNT_RESEARCH_REQUIRED");
    const contact = artifact.bestContact;
    const evidenceUrls = unique(artifact.research.evidence.map((item) => item.sourceUrl));
    const generated = await runtime.ai.generateStructured({ operation: "message", systemInstruction: buildOperationInstruction("message", contact ? `Return an English DRAFT of 80 to 180 words addressed to ${contact.name}, ${contact.title ?? "the cited contact"}. Use the supplied contact evidence conservatively, include a supplied evidence URL, and never send email.` : "Return an English account-level DRAFT of 80 to 180 words, targeting 110 to 150 words. Include a supplied evidence URL. Never send email."), input: { sellerKnowledge: runtime.sellerKnowledge, account: artifact.account, contact: contact ? { id: contact.id, fullName: contact.name, jobTitle: contact.title, department: contact.persona, sourceUrl: contact.sourceUrl, sourceQuote: contact.sourceQuote } : null, companyResearch: artifact.research, signals: artifact.signals, qualification: artifact.qualification, evidenceUrls }, outputSchema: outreachDraftSchema, promptVersion: "outreach-draft-v5", temperature: 0.2, maxTokens: 1_200 });
    const validation = validateOutreachDraft(generated.data, [...prohibitedOutreachClaims, ...runtime.sellerKnowledge.prohibitedClaims]);
    if (!validation.valid) throw new Error(`OUTREACH_VALIDATION_FAILED: ${validation.errors.join("; ")}`);
    if (contact) {
      const firstName = contact.name.trim().split(/\s+/)[0]!;
      if (!generated.data.body.toLowerCase().includes(firstName.toLowerCase()) && !generated.data.body.toLowerCase().includes(contact.name.toLowerCase())) throw new Error("OUTREACH_CONTACT_NOT_ADDRESSED: The draft does not address the selected public contact.");
    }
    const unsupportedClaim = generated.data.claimsUsed.find((claim) => !runtime.sellerKnowledge!.approvedClaims.includes(claim));
    if (unsupportedClaim) throw new Error(`OUTREACH_UNAPPROVED_CLAIM: ${unsupportedClaim}`);
    const idempotencyKey = `mission-draft-${input.missionId}`;
    const [created] = await db.insert(messages).values({ workspaceId: input.workspaceId, createdBy: runtime.userId, accountId: artifact.account.id, missionId: input.missionId, contactId: contact?.id, direction: "OUTBOUND", channel: "EMAIL", subject: generated.data.subject, body: generated.data.body, status: "DRAFT", evidenceIds: artifact.evidenceIds, claimsUsed: generated.data.claimsUsed, idempotencyKey }).onConflictDoNothing().returning({ id: messages.id });
    const [existing] = created ? [] : await db.select({ id: messages.id }).from(messages).where(and(eq(messages.workspaceId, input.workspaceId), eq(messages.idempotencyKey, idempotencyKey))).limit(1);
    const message = existing ?? created;
    if (!message) throw new Error("OUTREACH_PERSIST_FAILED");
    runtime.result.outreach = { ...generated.data, accountId: artifact.account.id, contactId: contact?.id, contactName: contact?.name };
    runtime.result.messageId = message.id;
    runtime.result.draftMessageIds.push(message.id);
    runtime.memory.draftMessageIds.push(message.id);
    runtime.memory.lastObservation = `Prepared an English outreach DRAFT for ${contact ? `${contact.name} at ` : ""}${artifact.account.name}; no email was sent.`;
    await db.update(agentMissionTargets).set({ messageId: message.id, currentStep: "Outreach DRAFT saved", updatedAt: runtime.now() }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId), eq(agentMissionTargets.accountId, artifact.account.id)));
    return { messageId: message.id, status: "DRAFT", outreach: runtime.result.outreach };
  });

  register("CREATE_TASK", "Create Task", "Create an internal next-step task.", async () => {
    if (!runtime.memory.bestAccountId || !runtime.result.messageId) throw new Error("DRAFT_REQUIRED_FOR_TASK");
    const artifact = runtime.artifacts.get(runtime.memory.bestAccountId)!;
    const contact = artifact.bestContact;
    const [existing] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.workspaceId, input.workspaceId), eq(tasks.missionId, input.missionId), eq(tasks.accountId, artifact.account.id))).limit(1);
    const taskTitle = contact ? `Review outreach draft for ${contact.name}` : `Review outreach draft and find a contact at ${artifact.account.name}`;
    const [created] = existing ? [] : await db.insert(tasks).values({ workspaceId: input.workspaceId, createdBy: runtime.userId, accountId: artifact.account.id, missionId: input.missionId, contactId: contact?.id, title: taskTitle, description: `Review the evidence-backed English DRAFT created by Mission ${input.missionId}.${contact ? ` Public contact: ${contact.name}, ${contact.title ?? "role not specified"}.` : " No named decision maker was supported by the fetched pages; identify one before follow-up."} No message has been sent.`, type: "FOLLOW_UP", priority: "HIGH", status: "OPEN", dueAt: new Date(runtime.now().getTime() + 2 * 86_400_000), assigneeName: "Sales Ops" }).returning({ id: tasks.id });
    const task = existing ?? created;
    if (!task) throw new Error("TASK_PERSIST_FAILED");
    runtime.result.taskIds.push(task.id);
    runtime.memory.taskIds.push(task.id);
    runtime.memory.lastObservation = `Created the next-step review task for ${artifact.account.name}.`;
    await db.update(agentMissionTargets).set({ taskId: task.id, currentStep: "Next-step task created", updatedAt: runtime.now() }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId), eq(agentMissionTargets.accountId, artifact.account.id)));
    return { taskId: task.id, title: taskTitle, contactId: contact?.id ?? null, status: "OPEN" };
  });

  register("UPDATE_MEMORY", "Update Memory", "Persist sourced account facts from mission results.", async () => {
    if (!runtime.memory.bestAccountId || !runtime.result.messageId) throw new Error("BEST_ACCOUNT_DRAFT_REQUIRED_FOR_MEMORY");
    const artifact = runtime.artifacts.get(runtime.memory.bestAccountId)!;
    const facts = [
      ["BUSINESS", artifact.research?.summary ?? `${artifact.account.name} is an industrial manufacturer.`],
      ["LIKELY_NEED", artifact.research?.likelyNeeds[0] ?? artifact.research?.likelyBusinessNeeds[0] ?? "May benefit from inline quality inspection."],
      ["SIGNAL", artifact.signals[0]?.summary ?? "No high-confidence public signal was found."],
      ["QUALIFICATION", `${artifact.qualification?.status} (${artifact.qualification?.score}/100): ${artifact.qualification?.reasons[0] ?? "Qualification completed."}`],
      ["NEXT_ACTION", artifact.bestContact ? `A DRAFT exists for ${artifact.bestContact.name}, ${artifact.bestContact.title ?? "public contact"}; review it before manual follow-up.` : `A DRAFT exists; find and verify a relevant contact before manual follow-up.`],
    ] as const;
    const existing = await db.select({ id: memoryFacts.id }).from(memoryFacts).where(and(eq(memoryFacts.workspaceId, input.workspaceId), eq(memoryFacts.missionId, input.missionId), eq(memoryFacts.accountId, artifact.account.id)));
    const saved = existing.length ? existing : await db.insert(memoryFacts).values(facts.map(([category, fact]) => ({ workspaceId: input.workspaceId, createdBy: runtime.userId, accountId: artifact.account.id, missionId: input.missionId, category, fact, confidence: (artifact.qualification?.confidence ?? 0.75).toFixed(3), sourceMessageId: runtime.result.messageId!, status: "ACTIVE", validFrom: runtime.now() }))).returning({ id: memoryFacts.id });
    runtime.result.memoryFactIds.push(...saved.map((row) => row.id));
    runtime.memory.memoryFactIds.push(...saved.map((row) => row.id));
    runtime.memory.lastObservation = `Wrote ${saved.length} sourced memory facts for ${artifact.account.name}.`;
    return { accountId: artifact.account.id, factsCreated: saved.length, memoryFactIds: saved.map((row) => row.id) };
  });

  register("SUMMARIZE_MISSION", "Summarize Mission", "Persist the final mission result.", async () => {
    const best = runtime.memory.bestAccountId ? runtime.artifacts.get(runtime.memory.bestAccountId) : undefined;
    const rankingReason = runtime.result.ranking?.rankedAccounts.find((item) => item.accountId === runtime.memory.bestAccountId)?.reason ?? null;
    const generated = await runtime.ai.generateStructured({ operation: "mission-summary", systemInstruction: buildOperationInstruction("mission-summary", "Summarize persisted artifacts only. State clearly that outreach remains DRAFT."), input: { accountsInvestigated: runtime.memory.researchedAccountIds.length, bestAccountId: runtime.memory.bestAccountId, bestContactId: runtime.memory.bestContactId, bestContact: best?.bestContact ? { name: best.bestContact.name, title: best.bestContact.title } : null, bestAccountReason: rankingReason, keySignals: best?.signals.map((signal) => signal.summary) ?? [], qualificationSummary: best?.qualification ? `${best.qualification.status} at ${best.qualification.score}/100` : "No qualification", outreachDraftId: runtime.result.messageId ?? null, taskIds: runtime.result.taskIds, memoryFactIds: runtime.result.memoryFactIds }, outputSchema: missionResultSchema, promptVersion: "mission-summary-v2", temperature: 0.1, maxTokens: 1_000 });
    Object.assign(runtime.result, generated.data);
    runtime.result.research = best?.research;
    runtime.result.qualification = best?.qualification;
    runtime.memory.lastObservation = generated.data.summary;
    return generated.data;
  });

  return registry.assertComplete();
}

async function failMission(input: MissionRunInput, runtime: Runtime, cause: unknown) {
  const changedAt = runtime.now();
  const message = messageFrom(cause);
  await db.transaction(async (tx) => {
    const failed = await tx.update(agentMissions).set({ status: "FAILED", plan: runtime.plan, workingMemory: runtime.memory, result: runtime.result, error: message, currentStep: "Mission failed", agentSummary: message, completedAt: changedAt, updatedAt: changedAt }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING"))).returning({ id: agentMissions.id });
    if (!failed.length) return;
    await tx.update(agentPlans).set({ status: "FAILED", updatedAt: changedAt }).where(and(eq(agentPlans.workspaceId, input.workspaceId), eq(agentPlans.missionId, input.missionId)));
    await tx.update(agentMissionTargets).set({ status: "FAILED", currentStep: "Mission failed", updatedAt: changedAt }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId)));
    await tx.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: runtime.userId, missionId: input.missionId, type: "MISSION_FAILED", title: "Autonomous mission execution failed.", description: message, severity: "ERROR", status: "FAILED", occurredAt: changedAt, metadata: { iteration: runtime.mission.iteration } });
  });
}

export async function executeMission(input: MissionRunInput, dependencies: RunnerDependencies = {}) {
  const [mission] = await db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId))).limit(1);
  if (!mission) throw new Error("MISSION_NOT_FOUND: Mission does not exist in this workspace.");
  if (mission.status === "COMPLETED" || mission.status === "CANCELLED") return persistedResult(mission.result);
  if (mission.status !== "RUNNING") throw new Error(`MISSION_NOT_RUNNING: expected RUNNING, received ${mission.status}.`);
  const plan = missionPlanSchema.parse(mission.plan);
  const runtime: Runtime = {
    mission, userId: mission.createdBy ?? fallbackUserId, ai: dependencies.ai ?? providerForMission(mission.provider, mission.model),
    now: dependencies.now ?? (() => new Date()), fetchResearch: dependencies.websiteResearch ?? (mission.provider === "mock-ai" ? mockWebsiteResearch : defaultWebsiteResearch),
    plan, memory: missionWorkingMemorySchema.safeParse(mission.workingMemory).success ? missionWorkingMemorySchema.parse(mission.workingMemory) : emptyMissionWorkingMemory(),
    result: persistedResult(mission.result),
    artifacts: new Map(), consecutiveFailures: 0,
  };
  await hydrateRuntime(input, runtime);
  await recoverInterruptedPlan(input, runtime);
  const registry = createRegistry(input, runtime);
  try {
    while (true) {
      const [fresh] = await db.select({ status: agentMissions.status }).from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId))).limit(1);
      if (fresh?.status === "CANCELLED") {
        await event(input, runtime, { type: "MISSION_EXECUTION_STOPPED", title: "Autonomous execution stopped after cancellation.", severity: "WARNING", metadata: { iteration: runtime.mission.iteration } });
        return runtime.result;
      }
      const stop = checkMissionStopConditions({ plan: runtime.plan, workingMemory: runtime.memory, iteration: runtime.mission.iteration, maximumIterations: runtime.mission.maximumIterations, consecutiveFailures: runtime.consecutiveFailures, cancelled: fresh?.status === "CANCELLED" });
      if (stop.stop && runtime.plan.steps.some((step) => step.status === "PENDING")) throw new Error(`MISSION_STOPPED: ${stop.reason}`);
      const decision = await decideNextMissionStep({ ai: runtime.ai, objective: runtime.mission.objective, plan: runtime.plan, workingMemory: runtime.memory, iteration: runtime.mission.iteration, maximumIterations: runtime.mission.maximumIterations });
      if (decision.action === "COMPLETE") break;
      if (decision.action === "FAIL") throw new Error(`MISSION_DECISION_FAILED: ${decision.reason}`);
      if (decision.action !== "EXECUTE_STEP" || !decision.stepId) throw new Error(`MISSION_DECISION_UNSUPPORTED: ${decision.action}`);
      const step = runtime.plan.steps.find((item) => item.id === decision.stepId);
      if (!step) throw new Error(`MISSION_DECISION_STEP_MISSING: ${decision.stepId}`);
      runtime.mission.iteration += 1;
      runtime.memory.notes = unique([...runtime.memory.notes, ...decision.updatedNotes]);
      runtime.memory.lastObservation = decision.reason;
      await markStep(input, runtime, step.id, "RUNNING");
      await event(input, runtime, { type: "AGENT_DECISION", title: `Navo selected: ${step.title}`, description: decision.reason, metadata: { action: decision.action, stepId: step.id, iteration: runtime.mission.iteration } });
      const [call] = await db.insert(toolCalls).values({ workspaceId: input.workspaceId, createdBy: runtime.userId, name: registry.get(step.type).label, status: "RUNNING", data: { missionId: input.missionId, stepId: step.id, type: step.type, iteration: runtime.mission.iteration } }).returning({ id: toolCalls.id });
      try {
        const output = await registry.execute(step.type, step.input ?? {}, { workspaceId: input.workspaceId, missionId: input.missionId, userId: runtime.userId, ai: runtime.ai, workingMemory: runtime.memory }) as Record<string, unknown>;
        await markStep(input, runtime, step.id, "COMPLETED", output);
        runtime.consecutiveFailures = 0;
        if (call) await db.update(toolCalls).set({ status: "COMPLETED", data: { missionId: input.missionId, stepId: step.id, type: step.type, iteration: runtime.mission.iteration, output }, updatedAt: runtime.now() }).where(eq(toolCalls.id, call.id));
        await event(input, runtime, { type: "TOOL_COMPLETED", title: `${registry.get(step.type).label} completed.`, description: runtime.memory.lastObservation ?? undefined, severity: "SUCCESS", metadata: { stepId: step.id, type: step.type, toolCallId: call?.id } });
        await persistRuntime(input, runtime, step.title);
      } catch (cause) {
        runtime.consecutiveFailures += 1;
        const message = messageFrom(cause);
        await markStep(input, runtime, step.id, "FAILED", {}, message);
        if (call) await db.update(toolCalls).set({ status: "FAILED", data: { missionId: input.missionId, stepId: step.id, type: step.type, error: message }, updatedAt: runtime.now() }).where(eq(toolCalls.id, call.id));
        throw cause;
      }
    }
    const completedAt = runtime.now();
    const best = runtime.memory.bestAccountId ? runtime.artifacts.get(runtime.memory.bestAccountId) : undefined;
    await db.transaction(async (tx) => {
      const completed = await tx.update(agentMissions).set({ status: "COMPLETED", plan: runtime.plan, workingMemory: runtime.memory, result: runtime.result, error: null, progress: 100, processedCount: runtime.memory.researchedAccountIds.length, qualifiedCount: [...runtime.artifacts.values()].filter((artifact) => (artifact.qualification?.score ?? 0) >= 60).length, pendingApprovalCount: 0, currentStep: "Mission completed", agentSummary: runtime.result.summary ?? runtime.memory.lastObservation ?? "Autonomous mission completed.", targetAccountId: runtime.memory.bestAccountId, completedAt, updatedAt: completedAt }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING"))).returning({ id: agentMissions.id });
      if (!completed.length) return;
      await tx.update(agentPlans).set({ status: "COMPLETED", updatedAt: completedAt }).where(and(eq(agentPlans.workspaceId, input.workspaceId), eq(agentPlans.missionId, input.missionId)));
      await tx.update(agentMissionTargets).set({ status: "COMPLETED", currentStep: "Mission completed", updatedAt: completedAt }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId)));
      await tx.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: runtime.userId, missionId: input.missionId, accountId: best?.account.id, messageId: runtime.result.messageId, taskId: runtime.result.taskIds[0], type: "MISSION_COMPLETED", title: "Autonomous mission completed.", description: runtime.result.summary, severity: "SUCCESS", occurredAt: completedAt, metadata: { accountsInvestigated: runtime.memory.researchedAccountIds.length, bestAccountId: runtime.memory.bestAccountId, evidenceCount: runtime.result.evidenceIds.length, signalCount: runtime.result.signalIds.length, draftStatus: "DRAFT" } });
    });
    return runtime.result;
  } catch (cause) {
    await failMission(input, runtime, cause);
    throw cause;
  }
}

export async function executeMissionDirect(input: MissionRunInput, dependencies: RunnerDependencies = {}) {
  const [mission] = await db.select({ status: agentMissions.status, createdBy: agentMissions.createdBy }).from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId))).limit(1);
  if (!mission) throw new Error("MISSION_NOT_FOUND: Mission does not exist in this workspace.");
  if (mission.status === "COMPLETED" || mission.status === "CANCELLED") return executeMission(input, dependencies);
  if (mission.status !== "RUNNING") {
    const started = await prepareMissionStart(input.workspaceId, mission.createdBy ?? fallbackUserId, input.missionId);
    if (started.kind !== "OK") throw new Error(`MISSION_DIRECT_START_FAILED: ${started.kind}`);
  }
  return executeMission(input, dependencies);
}
