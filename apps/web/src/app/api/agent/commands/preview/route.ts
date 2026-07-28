import { NextResponse } from "next/server";
import { z } from "zod";
import { missionTypeSchema } from "@navo/agents";
import { DEMO_WORKSPACE_ID, getAccounts, getKnowledgeBase } from "@navo/db";
import { planMission } from "@navo/workflows/mission-planner";
import { apiError, requireDemoSession } from "@/lib/api";
import { missionPlanProposal } from "../../../missions/_shared";
import { resolveWorkspaceAIProvider } from "@/lib/ai-provider";

const inputSchema = z.object({ command: z.string().trim().min(8).max(2_000), missionType: missionTypeSchema.optional() });

export async function POST(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_COMMAND", "Tell Navo what outcome you want.", 422, parsed.error.flatten());
  try {
    const [knowledge, accounts] = await Promise.all([getKnowledgeBase(DEMO_WORKSPACE_ID), getAccounts(DEMO_WORKSPACE_ID)]);
    const generated = await planMission(await resolveWorkspaceAIProvider(DEMO_WORKSPACE_ID), {
      objective: parsed.data.command,
      missionType: parsed.data.missionType,
      sellerKnowledge: {
        companyName: knowledge.company?.name ?? "Nova Automation",
        companyDescription: knowledge.company?.descriptionEn ?? "Industrial automation supplier",
        products: knowledge.product ? [knowledge.product.nameEn] : [],
        capabilities: knowledge.product?.capabilities ?? [],
        targetIndustries: knowledge.icp?.industries ?? [],
        targetRegions: knowledge.icp?.countries ?? [],
        approvedClaims: knowledge.claims.map((claim) => claim.claim),
        prohibitedClaims: knowledge.product?.prohibitedClaims ?? [],
      },
      availableAccounts: accounts.map((account) => ({ id: account.id, name: account.name, website: account.website ?? undefined, country: account.country ?? undefined, industry: account.industry ?? undefined })),
      maximumIterations: 20,
    });
    return NextResponse.json({ data: { ...missionPlanProposal(generated.data), provider: generated.provider, model: generated.model, plannerMode: generated.plannerMode, fallbackReason: generated.fallbackReason ?? null, deterministic: generated.provider === "mock-ai" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Mission planner failed.";
    return apiError("MISSION_PLANNER_FAILED", message, 502);
  }
}
