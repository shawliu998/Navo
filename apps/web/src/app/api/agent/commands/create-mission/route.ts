import { getAIProvider } from "@navo/agents";
import { createMission, DEMO_WORKSPACE_ID, failMissionQueue, getPlays, prepareMissionStart } from "@navo/db/queries";
import { planMission } from "@navo/workflows/mission-planner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireDemoSession } from "@/lib/api";
import { enqueueMission } from "@/lib/mission-queue";
import { DEMO_USER_ID, missionPlanProposal } from "../../../missions/_shared";

const inputSchema = z.object({
  command: z.string().trim().min(8).max(2_000),
  name: z.string().trim().min(3).max(160).optional(),
  status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
  accountIds: z.array(z.string().uuid()).max(100).optional(),
  targetCount: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_COMMAND", "Command input is invalid.", 422, parsed.error.flatten());
  try {
    const generated = await planMission(getAIProvider(), { name: parsed.data.name, objective: parsed.data.command });
    const proposal = missionPlanProposal(generated.data);
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
      targetAccountId: parsed.data.accountIds?.[0],
      targetCount: 1,
      maximumAccounts: 1,
      estimatedCostLimit: proposal.estimatedCost,
      testMode: true,
      stopConditions: ["Stop on suppression conflict", "Never send without approval"],
      plan: generated.data,
      provider: generated.provider,
      model: generated.model,
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
