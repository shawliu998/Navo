import { createMission, DEMO_WORKSPACE_ID, getPlays } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireDemoSession } from "@/lib/api";
import { DEMO_USER_ID, deterministicCommandProposal } from "../../../missions/_shared";

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
  const proposal = deterministicCommandProposal(parsed.data.command);
  const plays = await getPlays(DEMO_WORKSPACE_ID);
  const play = plays.find((item) => item.name === proposal.recommendedPlaybook);
  const mission = await createMission(DEMO_WORKSPACE_ID, DEMO_USER_ID, {
    name: parsed.data.name ?? proposal.name,
    type: proposal.missionType,
    objective: proposal.objective,
    desiredOutcome: proposal.expectedOutputs.join(", "),
    status: parsed.data.status,
    operatingMode: proposal.operatingMode,
    playId: play?.id,
    inputSource: proposal.inputSource,
    accountIds: parsed.data.accountIds,
    targetCount: parsed.data.targetCount ?? proposal.estimatedAccounts,
    maximumAccounts: parsed.data.targetCount ?? proposal.estimatedAccounts,
    estimatedCostLimit: proposal.estimatedCost,
    testMode: true,
    stopConditions: ["Stop on suppression conflict", "Never send without approval"],
  });
  return NextResponse.json({ data: mission, missionId: mission.id, proposal }, { status: 201 });
}
