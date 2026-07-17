import { DEMO_WORKSPACE_ID, getAgentStatus } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";

export async function GET() {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const data = await getAgentStatus(DEMO_WORKSPACE_ID);
  return NextResponse.json({
    agent: {
      status: data.profile?.status ?? "IDLE",
      headline: data.profile?.status === "PAUSED" ? "Navo is paused" : data.pendingApprovalCount > 0 && data.currentMission?.status === "WAITING" ? "Navo is waiting for approval" : "Navo is active",
      detail: data.profile?.currentActivity ?? data.currentMission?.currentStep ?? "Monitoring missions",
      activeMissions: data.activeMissionCount,
      pendingApprovals: data.pendingApprovalCount,
      operatingMode: data.profile?.operatingMode ?? data.preferences?.operatingMode ?? "APPROVAL_CONTROLLED",
    },
    data,
  });
}
