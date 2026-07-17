import { accounts, createMission, db, DEMO_WORKSPACE_ID, failMissionQueue, getPlays, prepareMissionStart } from "@navo/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireDemoSession } from "@/lib/api";
import { enqueueMission } from "@/lib/mission-queue";
import { DEMO_USER_ID, missionPlanProposal } from "../../../missions/_shared";
import { guardMissionAccount } from "@/lib/mission-command";
import { mockMissionPreviewSchema } from "@/lib/mission-preview";

const inputSchema = z.object({
  command: z.string().trim().min(8).max(2_000),
  name: z.string().trim().min(3).max(160).optional(),
  status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
  accountIds: z.array(z.string().uuid()).max(100).optional(),
  preview: mockMissionPreviewSchema,
});

export async function POST(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_COMMAND", "Command input is invalid.", 422, parsed.error.flatten());
  try {
    const selectedId = parsed.data.accountIds?.[0];
    const [account] = selectedId ? await db.select({ id: accounts.id, workspaceId: accounts.workspaceId, website: accounts.website, domain: accounts.domain }).from(accounts).where(and(eq(accounts.workspaceId, DEMO_WORKSPACE_ID), eq(accounts.id, selectedId))).limit(1) : [];
    const accountGuard = selectedId ? guardMissionAccount({ accountIds: [selectedId], workspaceId: DEMO_WORKSPACE_ID, account: account ?? null }) : null;
    if (accountGuard && !accountGuard.ok) return apiError(accountGuard.code, accountGuard.message, 422);
    const generated = parsed.data.preview;
    const proposal = missionPlanProposal(generated.plan);
    const plays = await getPlays(DEMO_WORKSPACE_ID);
    const play = plays.find((item) => item.name === proposal.recommendedPlaybook);
    const mission = await createMission(DEMO_WORKSPACE_ID, DEMO_USER_ID, {
      name: parsed.data.name ?? proposal.name,
      type: proposal.missionType,
      objective: proposal.objective,
      desiredOutcome: proposal.expectedOutputs.join(", "),
      status: parsed.data.status === "ACTIVE" ? "READY" : "DRAFT",
      operatingMode: proposal.operatingMode,
      playId: play?.id,
      inputSource: proposal.inputSource,
      targetAccountId: accountGuard?.ok ? accountGuard.accountId : undefined,
      targetCount: accountGuard?.ok ? 1 : 0,
      maximumAccounts: 3,
      maximumIterations: 20,
      autoContinue: true,
      maximumContinuations: 2,
      estimatedCostLimit: proposal.estimatedCost,
      testMode: true,
      stopConditions: generated.plan.stopConditions,
      plan: generated.plan,
      provider: generated.provider,
      model: generated.model,
      plannerMode: generated.plannerMode,
      plannerFallbackReason: generated.fallbackReason ?? undefined,
    });
    let responseMission = mission;
    if (parsed.data.status === "ACTIVE") {
      const started = await prepareMissionStart(DEMO_WORKSPACE_ID, DEMO_USER_ID, mission.id);
      if (started.kind !== "OK") return apiError("MISSION_START_FAILED", "Mission could not start.", 409, started);
      responseMission = started.mission;
      try { await enqueueMission({ workspaceId: DEMO_WORKSPACE_ID, missionId: mission.id }); }
      catch {
        const message = "MISSION_QUEUE_FAILED: Redis queue submission failed.";
        await failMissionQueue(DEMO_WORKSPACE_ID, DEMO_USER_ID, mission.id, message);
        return apiError("MISSION_QUEUE_FAILED", message, 503, { missionId: mission.id });
      }
    }
    return NextResponse.json({ data: responseMission, missionId: mission.id, proposal }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Mission could not be created.";
    return apiError(message.startsWith("MISSION_TARGET") ? "MISSION_TARGET_REQUIRED" : "MISSION_PLANNER_FAILED", message, message.startsWith("MISSION_TARGET") ? 422 : 502);
  }
}
