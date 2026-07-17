import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@navo/agents";
import { planMission } from "@navo/workflows/mission-planner";
import { apiError, requireDemoSession } from "@/lib/api";
import { missionPlanProposal } from "../../../missions/_shared";

const inputSchema = z.object({ command: z.string().trim().min(8).max(2_000) });

export async function POST(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_COMMAND", "Tell Navo what outcome you want.", 422, parsed.error.flatten());
  try {
    const generated = await planMission(getAIProvider(), { objective: parsed.data.command });
    return NextResponse.json({ data: { ...missionPlanProposal(generated.data), provider: generated.provider, model: generated.model, deterministic: generated.provider === "mock-ai" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Mission planner failed.";
    return apiError("MISSION_PLANNER_FAILED", message, 502);
  }
}
