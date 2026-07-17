import { and, eq, inArray } from "drizzle-orm";
import {
  approvedClaims, accounts, agentEvents, agentMissions, agentMissionTargets, agentPlans, agentPlanSteps, db,
  evidence, icpProfiles, messages, prepareMissionStart, products, qualificationResults, signals, workspaces,
} from "@navo/db";
import {
  buildOperationInstruction, companyResearchOutputSchema, DeepSeekAIProvider, getAIProvider, missionPlanSchema, MockAIProvider,
  outreachDraftSchema, prohibitedOutreachClaims, qualificationOutputSchema, salesSignalOutputSchema,
  validateOutreachDraft, type AIProvider, type CompanyResearchOutput, type OutreachDraft, type SalesSignalOutput,
} from "@navo/agents";
import { qualifyAccount } from "@navo/domain";
import { assertExecutableMissionPlan } from "@navo/workflows/mission-planner";
import { fetchWebsiteResearch, type WebsiteResearchData, type WebsiteResearchInput, type WebsiteResearchOutput } from "@navo/workflows/website-research";
import { isLocalDemoWebsite, loadLocalWebsiteResearchFixture } from "@navo/workflows/website-research/fixture";

const fallbackUserId = "00000000-0000-4000-8000-000000000002";
type MissionStepType = "LOAD_KNOWLEDGE" | "LOAD_ACCOUNT" | "RESEARCH_WEBSITE" | "EXTRACT_SIGNALS" | "QUALIFY_ACCOUNT" | "GENERATE_OUTREACH";
type MissionRunInput = { workspaceId: string; missionId: string };
type RunnerDependencies = { ai?: AIProvider; websiteResearch?: (input: WebsiteResearchInput) => Promise<WebsiteResearchOutput>; now?: () => Date };
type PersistedResult = {
  website?: WebsiteResearchData;
  research?: CompanyResearchOutput;
  evidenceIds?: string[];
  signals?: SalesSignalOutput["signals"];
  signalIds?: string[];
  qualification?: { id: string; score: number; status: string; reasons: string[]; risks: string[]; confidence: number };
  outreach?: OutreachDraft;
  messageId?: string;
};

const messageFrom = (cause: unknown) => cause instanceof Error ? cause.message : "Unknown mission execution error";

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

export function validateSignalEvidence(output: SalesSignalOutput, validUrls: Set<string>) {
  for (const [index, signal] of output.signals.entries()) {
    if (!signal.evidenceUrls.length || signal.evidenceUrls.some((url) => !validUrls.has(url))) {
      throw new Error(`SIGNAL_EVIDENCE_INVALID: signal ${index + 1} must reference persisted evidence URLs only.`);
    }
  }
}

async function defaultWebsiteResearch(input: WebsiteResearchInput): Promise<WebsiteResearchOutput> {
  if (isLocalDemoWebsite(input.websiteUrl)) return { ok: true, data: await loadLocalWebsiteResearchFixture(input.accountId, input.websiteUrl) };
  return fetchWebsiteResearch(input);
}

async function markStage(input: MissionRunInput, userId: string, accountId: string, type: MissionStepType, title: string, progress: number) {
  const changedAt = new Date();
  await db.transaction(async (tx) => {
    const [step] = await tx.select({ id: agentPlanSteps.id }).from(agentPlanSteps).where(and(eq(agentPlanSteps.workspaceId, input.workspaceId), eq(agentPlanSteps.missionId, input.missionId), eq(agentPlanSteps.relatedPlayNodeId, type))).limit(1);
    if (!step) throw new Error(`MISSION_PLAN_STEP_MISSING: ${type}`);
    await tx.update(agentPlanSteps).set({ status: "RUNNING", startedAt: changedAt, completedAt: null, errorCode: null, errorMessage: null, updatedAt: changedAt }).where(eq(agentPlanSteps.id, step.id));
    await tx.update(agentMissions).set({ currentStep: title, progress, agentSummary: title, updatedAt: changedAt }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING")));
    await tx.update(agentMissionTargets).set({ status: "RUNNING", currentStep: title, updatedAt: changedAt }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId), eq(agentMissionTargets.accountId, accountId)));
    await tx.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: userId, missionId: input.missionId, accountId, type: `${type}_STARTED`, title, severity: "INFO", occurredAt: changedAt, metadata: { stepType: type } });
  });
}

async function completeStage(input: MissionRunInput, accountId: string, type: MissionStepType, output: Record<string, unknown>, evidenceIds: string[] = []) {
  const changedAt = new Date();
  await db.update(agentPlanSteps).set({ status: "COMPLETED", output, evidence: evidenceIds, completedAt: changedAt, updatedAt: changedAt }).where(and(eq(agentPlanSteps.workspaceId, input.workspaceId), eq(agentPlanSteps.missionId, input.missionId), eq(agentPlanSteps.relatedPlayNodeId, type)));
  await db.update(agentMissionTargets).set({ currentStep: `${type} completed`, updatedAt: changedAt }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId), eq(agentMissionTargets.accountId, accountId)));
}

async function saveProgress(input: MissionRunInput, result: PersistedResult, progress: number, currentStep: string, provider?: string, model?: string) {
  await db.update(agentMissions).set({ result, progress, currentStep, provider, model, updatedAt: new Date() }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING")));
}

async function failMission(input: MissionRunInput, userId: string, accountId: string | undefined, stage: MissionStepType | undefined, cause: unknown, result: PersistedResult) {
  const changedAt = new Date();
  const message = messageFrom(cause);
  await db.transaction(async (tx) => {
    await tx.update(agentMissions).set({ status: "FAILED", result, error: message, currentStep: stage ? `${stage} failed` : "Mission failed", agentSummary: message, completedAt: changedAt, updatedAt: changedAt }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId)));
    if (accountId) await tx.update(agentMissionTargets).set({ status: "FAILED", currentStep: stage ? `${stage} failed` : "Mission failed", updatedAt: changedAt }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId), eq(agentMissionTargets.accountId, accountId)));
    if (stage) await tx.update(agentPlanSteps).set({ status: "FAILED", errorCode: message.split(":", 1)[0]?.slice(0, 120), errorMessage: message, completedAt: changedAt, updatedAt: changedAt }).where(and(eq(agentPlanSteps.workspaceId, input.workspaceId), eq(agentPlanSteps.missionId, input.missionId), eq(agentPlanSteps.relatedPlayNodeId, stage), inArray(agentPlanSteps.status, ["RUNNING", "PENDING"])));
    await tx.update(agentPlans).set({ status: "FAILED", updatedAt: changedAt }).where(and(eq(agentPlans.workspaceId, input.workspaceId), eq(agentPlans.missionId, input.missionId)));
    await tx.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: userId, missionId: input.missionId, accountId, type: "MISSION_FAILED", title: "Mission execution failed.", description: message, severity: "ERROR", status: "FAILED", occurredAt: changedAt, metadata: { stage: stage ?? "LOAD" } });
  });
}

function isHardExcluded(account: typeof accounts.$inferSelect, exclusions: string[]) {
  if (account.suppressed) return true;
  const industry = (account.industry ?? "").toLowerCase();
  return exclusions.some((rule) => {
    const normalized = rule.toLowerCase();
    return normalized.includes("consumer") && industry.includes("consumer") || normalized.includes("service") && industry.includes("service");
  });
}

export async function executeMission(input: MissionRunInput, dependencies: RunnerDependencies = {}) {
  let ai = dependencies.ai;
  const fetchResearch = dependencies.websiteResearch ?? defaultWebsiteResearch;
  const now = dependencies.now ?? (() => new Date());
  let currentStage: MissionStepType | undefined;
  let accountId: string | undefined;
  let userId = fallbackUserId;
  const result: PersistedResult = {};
  try {
    const [mission] = await db.select().from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId))).limit(1);
    if (!mission) throw new Error("MISSION_NOT_FOUND: Mission does not exist in this workspace.");
    ai ??= providerForMission(mission.provider, mission.model);
    userId = mission.createdBy ?? fallbackUserId;
    if (mission.status !== "RUNNING") throw new Error(`MISSION_NOT_RUNNING: expected RUNNING, received ${mission.status}.`);
    assertExecutableMissionPlan(missionPlanSchema.parse(mission.plan));
    accountId = mission.targetAccountId ?? undefined;
    if (!accountId) throw new Error("MISSION_TARGET_ACCOUNT_REQUIRED: Mission has no selected account.");
    const [account] = await db.select().from(accounts).where(and(eq(accounts.workspaceId, input.workspaceId), eq(accounts.id, accountId))).limit(1);
    if (!account) throw new Error("MISSION_TARGET_ACCOUNT_NOT_FOUND: Selected account is outside this workspace or missing.");
    if (!account.website) throw new Error("MISSION_TARGET_WEBSITE_REQUIRED: Selected account has no website URL.");

    currentStage = "LOAD_KNOWLEDGE";
    await markStage(input, userId, account.id, currentStage, "Loading seller knowledge", 5);
    const [[workspace], [product], [icp], claims] = await Promise.all([
      db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1),
      db.select().from(products).where(and(eq(products.workspaceId, input.workspaceId), eq(products.status, "ACTIVE"))).limit(1),
      db.select().from(icpProfiles).where(eq(icpProfiles.workspaceId, input.workspaceId)).limit(1),
      db.select().from(approvedClaims).where(and(eq(approvedClaims.workspaceId, input.workspaceId), eq(approvedClaims.status, "APPROVED"))),
    ]);
    if (!workspace || !product || !icp) throw new Error("SELLER_KNOWLEDGE_INCOMPLETE: Company, product, and ICP knowledge are required.");
    const sellerKnowledge = { companyName: workspace.name, products: [product.nameEn, ...(product.capabilities as string[])], targetIndustries: icp.industries as string[], targetRegions: icp.countries as string[], approvedClaims: claims.map((claim) => claim.claim), prohibitedClaims: product.prohibitedClaims as string[] };
    await completeStage(input, account.id, currentStage, { companyName: workspace.name, productId: product.id, approvedClaimCount: claims.length });

    currentStage = "LOAD_ACCOUNT";
    await markStage(input, userId, account.id, currentStage, "Loading the selected account", 12);
    await completeStage(input, account.id, currentStage, { accountId: account.id, website: account.website });

    currentStage = "RESEARCH_WEBSITE";
    await markStage(input, userId, account.id, currentStage, "Fetching and researching the account website", 20);
    const website = await fetchResearch({ accountId: account.id, websiteUrl: account.website });
    if (!website.ok) throw new Error(`WEBSITE_RESEARCH_FAILED: ${website.error.code}: ${website.error.message}`);
    result.website = website.data;
    await saveProgress(input, result, 30, "Website fetched");
    await db.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: userId, missionId: input.missionId, accountId: account.id, type: "WEBSITE_FETCHED", title: "Website pages fetched safely.", severity: "SUCCESS", occurredAt: now(), metadata: { pageCount: website.data.pages.length, fixture: isLocalDemoWebsite(account.website) } });

    const researchGeneration = await ai.generateStructured({ operation: "company-research", systemInstruction: buildOperationInstruction("company-research", "Use only fetched pages. Every quote must be copied literally and sourceUrl must exactly equal one supplied page URL."), input: { accountId: account.id, companyName: account.name, website: account.website, pageContents: website.data.pages.map(({ url, title, text }) => ({ url, title, text })), evidenceUrls: website.data.pages.map((page) => page.url) }, outputSchema: companyResearchOutputSchema, promptVersion: "company-research-v2", temperature: 0.1, maxTokens: 1_800 });
    validateResearchEvidence(researchGeneration.data, website.data);
    result.research = researchGeneration.data;
    const savedEvidence = await db.transaction(async (tx) => {
      const rows = await tx.insert(evidence).values(researchGeneration.data.evidence.map((item) => ({ workspaceId: input.workspaceId, createdBy: userId, accountId: account.id, type: "WEBSITE", title: item.claim, summary: item.claim, quote: item.quote, sourceUrl: item.sourceUrl, pageTitle: item.sourceTitle, observedAt: now(), fetchedAt: new Date(website.data.fetchedAt), confidence: item.confidence.toFixed(3), metadata: { missionId: input.missionId, provider: researchGeneration.provider, model: researchGeneration.model } }))).returning({ id: evidence.id, sourceUrl: evidence.sourceUrl });
      await tx.update(accounts).set({ summary: researchGeneration.data.summary, lastResearchedAt: now(), updatedAt: now() }).where(and(eq(accounts.workspaceId, input.workspaceId), eq(accounts.id, account.id)));
      return rows;
    });
    result.evidenceIds = savedEvidence.map((item) => item.id);
    await completeStage(input, account.id, currentStage, { pageCount: website.data.pages.length, evidenceCount: savedEvidence.length, research: researchGeneration.data }, result.evidenceIds);
    await saveProgress(input, result, 50, "Company research and evidence saved", researchGeneration.provider, researchGeneration.model);
    await db.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: userId, missionId: input.missionId, accountId: account.id, type: "EVIDENCE_SAVED", title: "Company research and literal evidence saved.", severity: "SUCCESS", occurredAt: now(), metadata: { evidenceIds: result.evidenceIds } });

    currentStage = "EXTRACT_SIGNALS";
    await markStage(input, userId, account.id, currentStage, "Extracting evidence-linked sales signals", 58);
    const evidenceUrls = [...new Set(savedEvidence.map((item) => item.sourceUrl).filter((url): url is string => Boolean(url)))];
    const signalGeneration = await ai.generateStructured({ operation: "signal-extraction", systemInstruction: buildOperationInstruction("signal-extraction", "Every signal must cite at least one URL from evidenceUrls and no other URL."), input: { companyResearch: researchGeneration.data, sellerKnowledge, evidenceUrls }, outputSchema: salesSignalOutputSchema, promptVersion: "signal-extraction-v2", temperature: 0.1, maxTokens: 1_200 });
    validateSignalEvidence(signalGeneration.data, new Set(evidenceUrls));
    const savedSignals = await db.insert(signals).values(signalGeneration.data.signals.map((item) => ({ workspaceId: input.workspaceId, createdBy: userId, accountId: account.id, type: item.type, summary: item.summary, rationale: item.rationale, evidenceUrls: item.evidenceUrls, confidence: item.confidence.toFixed(3), status: "NEW", detectedAt: now() }))).returning({ id: signals.id });
    result.signals = signalGeneration.data.signals;
    result.signalIds = savedSignals.map((item) => item.id);
    await completeStage(input, account.id, currentStage, { signalCount: savedSignals.length, signals: signalGeneration.data.signals }, result.evidenceIds);
    await saveProgress(input, result, 65, "Signals saved", signalGeneration.provider, signalGeneration.model);

    currentStage = "QUALIFY_ACCOUNT";
    await markStage(input, userId, account.id, currentStage, "Applying deterministic qualification", 72);
    const semantic = await ai.generateStructured({ operation: "qualification", systemInstruction: buildOperationInstruction("qualification", "Return semantic fit only. Code applies authoritative deterministic rules and hard exclusions."), input: { account: { name: account.name, country: account.country, industry: account.industry }, research: researchGeneration.data, signals: signalGeneration.data.signals, evidenceIds: result.evidenceIds }, outputSchema: qualificationOutputSchema, promptVersion: "qualification-v2", temperature: 0.1, maxTokens: 900 });
    const industryMatch = sellerKnowledge.targetIndustries.some((value) => value.toLowerCase() === (account.industry ?? "").toLowerCase());
    const regionMatch = sellerKnowledge.targetRegions.some((value) => value.toLowerCase() === (account.country ?? "").toLowerCase());
    const qualification = qualifyAccount({ hardRules: industryMatch && regionMatch ? 100 : industryMatch || regionMatch ? 70 : 35, businessSignals: Math.min(100, 45 + signalGeneration.data.signals.length * 20), productMatch: industryMatch ? 90 : 50, similarCaseMatch: researchGeneration.data.productsAndServices.length ? 70 : 40, semanticJudgment: semantic.data.score, hardExcluded: isHardExcluded(account, icp.hardExclusions as string[]), evidenceIds: result.evidenceIds });
    const qualificationReasons = qualification.status === "DISQUALIFIED" ? [qualification.explanation] : [qualification.explanation, ...semantic.data.reasons];
    const [savedQualification] = await db.insert(qualificationResults).values({ workspaceId: input.workspaceId, createdBy: userId, accountId: account.id, score: qualification.score, status: qualification.status, scoreBreakdown: qualification.scoreBreakdown, reasons: qualificationReasons, risks: semantic.data.risks, evidenceIds: result.evidenceIds, inferenceIds: [], confidence: semantic.data.confidence.toFixed(3) }).returning({ id: qualificationResults.id });
    if (!savedQualification) throw new Error("QUALIFICATION_PERSIST_FAILED: Insert did not return a result.");
    await db.update(accounts).set({ fitScore: qualification.score, qualification: qualification.status, updatedAt: now() }).where(and(eq(accounts.workspaceId, input.workspaceId), eq(accounts.id, account.id)));
    result.qualification = { id: savedQualification.id, score: qualification.score, status: qualification.status, reasons: qualificationReasons, risks: semantic.data.risks, confidence: semantic.data.confidence };
    await completeStage(input, account.id, currentStage, result.qualification, result.evidenceIds);
    await saveProgress(input, result, 80, "Qualification saved", semantic.provider, semantic.model);

    currentStage = "GENERATE_OUTREACH";
    await markStage(input, userId, account.id, currentStage, "Generating a safe outreach draft", 88);
    const outreachGeneration = await ai.generateStructured({ operation: "message", systemInstruction: buildOperationInstruction("message", "Return a DRAFT only. Body is at most 180 English words, includes a supplied evidence URL literally, uses only approved claims, and avoids prohibited claims."), input: { sellerKnowledge, account: { id: account.id, name: account.name, website: account.website }, companyResearch: researchGeneration.data, evidence: researchGeneration.data.evidence, signals: signalGeneration.data.signals, qualification: result.qualification, evidenceUrls }, outputSchema: outreachDraftSchema, promptVersion: "outreach-draft-v2", temperature: 0.2, maxTokens: 1_200 });
    const outreachValidation = validateOutreachDraft(outreachGeneration.data, [...prohibitedOutreachClaims, ...sellerKnowledge.prohibitedClaims]);
    if (!outreachValidation.valid) throw new Error(`OUTREACH_VALIDATION_FAILED: ${outreachValidation.errors.join("; ")}`);
    const unsupportedClaim = outreachGeneration.data.claimsUsed.find((claim) => !sellerKnowledge.approvedClaims.includes(claim));
    if (unsupportedClaim) throw new Error(`OUTREACH_UNAPPROVED_CLAIM: ${unsupportedClaim}`);
    const unknownEvidenceUrl = outreachGeneration.data.evidenceUrls.find((url) => !evidenceUrls.includes(url));
    if (unknownEvidenceUrl) throw new Error(`OUTREACH_EVIDENCE_INVALID: ${unknownEvidenceUrl}`);
    const [message] = await db.insert(messages).values({ workspaceId: input.workspaceId, createdBy: userId, accountId: account.id, direction: "OUTBOUND", channel: "EMAIL", subject: outreachGeneration.data.subject, body: outreachGeneration.data.body, status: "DRAFT", evidenceIds: result.evidenceIds, claimsUsed: outreachGeneration.data.claimsUsed, idempotencyKey: `mission-draft-${input.missionId}` }).returning({ id: messages.id });
    if (!message) throw new Error("OUTREACH_PERSIST_FAILED: Message insert did not return a row.");
    result.outreach = outreachGeneration.data;
    result.messageId = message.id;
    await completeStage(input, account.id, currentStage, { messageId: message.id, status: "DRAFT", outreach: outreachGeneration.data }, result.evidenceIds);

    const completedAt = now();
    await db.transaction(async (tx) => {
      await tx.update(agentMissions).set({ status: "COMPLETED", result, error: null, progress: 100, processedCount: 1, qualifiedCount: qualification.status === "DISQUALIFIED" || qualification.status === "LOW_FIT" ? 0 : 1, pendingApprovalCount: 0, currentStep: "Mission completed", agentSummary: "Research, evidence, signals, qualification, and a safe draft were saved.", provider: outreachGeneration.provider, model: outreachGeneration.model, completedAt, updatedAt: completedAt }).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId), eq(agentMissions.status, "RUNNING")));
      await tx.update(agentPlans).set({ status: "COMPLETED", updatedAt: completedAt }).where(and(eq(agentPlans.workspaceId, input.workspaceId), eq(agentPlans.missionId, input.missionId)));
      await tx.update(agentMissionTargets).set({ status: "COMPLETED", currentStep: "Mission completed", messageId: message.id, findingConfidence: semantic.data.confidence.toFixed(3), suggestedAction: "Review the saved draft", updatedAt: completedAt }).where(and(eq(agentMissionTargets.workspaceId, input.workspaceId), eq(agentMissionTargets.missionId, input.missionId), eq(agentMissionTargets.accountId, account.id)));
      await tx.insert(agentEvents).values({ workspaceId: input.workspaceId, createdBy: userId, missionId: input.missionId, accountId: account.id, messageId: message.id, type: "MISSION_COMPLETED", title: "Mission completed with a saved outreach draft.", severity: "SUCCESS", occurredAt: completedAt, metadata: { evidenceCount: result.evidenceIds?.length ?? 0, signalCount: result.signalIds?.length ?? 0, messageStatus: "DRAFT" } });
    });
    return result;
  } catch (cause) {
    await failMission(input, userId, accountId, currentStage, cause, result);
    throw cause;
  }
}

export async function executeMissionDirect(input: MissionRunInput, dependencies: RunnerDependencies = {}) {
  const [mission] = await db.select({ status: agentMissions.status, createdBy: agentMissions.createdBy }).from(agentMissions).where(and(eq(agentMissions.workspaceId, input.workspaceId), eq(agentMissions.id, input.missionId))).limit(1);
  if (!mission) throw new Error("MISSION_NOT_FOUND: Mission does not exist in this workspace.");
  if (mission.status !== "RUNNING") {
    const started = await prepareMissionStart(input.workspaceId, mission.createdBy ?? fallbackUserId, input.missionId);
    if (started.kind !== "OK") throw new Error(`MISSION_DIRECT_START_FAILED: ${started.kind}`);
  }
  return executeMission(input, dependencies);
}
