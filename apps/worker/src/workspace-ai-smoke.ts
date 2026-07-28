import { config } from "dotenv";
import { resolve } from "node:path";
import { createMission, DEMO_WORKSPACE_ID, getAccounts, getKnowledgeBase } from "@navo/db";
import { planMission } from "@navo/workflows/mission-planner";
import {
  getWorkspaceAIExecutionDescriptor,
  resolveWorkspaceAIProvider,
} from "./ai-provider-resolver";
import { executeMissionDirect } from "./mission-runner";

config({ path: resolve(process.cwd(), "../../.env.local"), quiet: true });

const runChain = process.env.DEEPSEEK_SMOKE_CHAIN === "1";
const descriptor = await getWorkspaceAIExecutionDescriptor(DEMO_WORKSPACE_ID);
if (descriptor.provider === "mock-ai") {
  throw new Error("A tested workspace AI connection or DEEPSEEK_API_KEY fallback is required. Configure Settings → AI connection first.");
}
const ai = await resolveWorkspaceAIProvider(DEMO_WORKSPACE_ID);
const userId = "00000000-0000-4000-8000-000000000002";
const [knowledge, workspaceAccounts] = await Promise.all([getKnowledgeBase(DEMO_WORKSPACE_ID), getAccounts(DEMO_WORKSPACE_ID)]);
if (!knowledge.company || !knowledge.product || !knowledge.icp || !workspaceAccounts.length) throw new Error("Seeded company, product, ICP and at least one account are required. Run pnpm db:seed first.");

const generated = await planMission(ai, {
  name: "Workspace AI opportunity discovery smoke",
  missionType: "OPPORTUNITY_DISCOVERY",
  objective: "Research the available DACH industrial accounts, qualify and rank evidence-backed opportunities, then return the strongest opportunity or an explicit no-suitable-match outcome.",
  sellerKnowledge: {
    companyName: knowledge.company.name,
    companyDescription: knowledge.company.descriptionEn ?? "Industrial automation supplier",
    products: [knowledge.product.nameEn],
    capabilities: knowledge.product.capabilities as string[],
    targetIndustries: knowledge.icp.industries as string[],
    targetRegions: knowledge.icp.countries as string[],
    approvedClaims: knowledge.claims.map((claim) => claim.claim),
    prohibitedClaims: knowledge.product.prohibitedClaims as string[],
  },
  availableAccounts: workspaceAccounts.map((account) => ({ id: account.id, name: account.name, website: account.website ?? undefined, country: account.country ?? undefined, industry: account.industry ?? undefined })),
  maximumIterations: 20,
});
const mission = await createMission(DEMO_WORKSPACE_ID, userId, {
  name: generated.data.name,
  type: generated.data.missionType,
  objective: generated.data.objective,
  status: "READY",
  operatingMode: "AUTONOMOUS",
  maximumAccounts: 3,
  maximumIterations: 20,
  testMode: false,
  plan: generated.data,
  provider: generated.provider,
  model: generated.model,
  plannerMode: generated.plannerMode,
  plannerFallbackReason: generated.fallbackReason,
  autoContinue: runChain,
  maximumContinuations: runChain ? 1 : 0,
});
const queued: string[] = [];
const enqueueMission = async (input: { missionId: string }) => { queued.push(input.missionId); };
const result = await executeMissionDirect({ workspaceId: DEMO_WORKSPACE_ID, missionId: mission.id }, { ai, enqueueMission });
const successorMissionId = queued[0] ?? null;
const successorResult = successorMissionId ? await executeMissionDirect({ workspaceId: DEMO_WORKSPACE_ID, missionId: successorMissionId }, { ai, enqueueMission }) : null;
console.log(JSON.stringify({
  missionId: mission.id,
  provider: generated.provider,
  model: generated.model,
  plannerMode: generated.plannerMode,
  fallbackReason: generated.fallbackReason ?? null,
  outcome: result.outcome,
  bestAccountId: result.bestAccountId,
  summary: result.summary,
  successorMissionId,
  successorOutcome: successorResult?.outcome ?? null,
}, null, 2));
