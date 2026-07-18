import { DEMO_WORKSPACE_ID, updateAgentDirectorConfig } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { directorConfigPatchSchema, directorConfigResponse } from "@/lib/director-config";
import { enqueueAgentTick } from "@/lib/mission-queue";
import { DEMO_USER_ID } from "../../missions/_shared";

export async function PATCH(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = directorConfigPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_DIRECTOR_CONFIG", "Director configuration is invalid.", 422, parsed.error.flatten());
  const result = await updateAgentDirectorConfig(DEMO_WORKSPACE_ID, DEMO_USER_ID, parsed.data);
  if (!result) return apiError("AGENT_PROFILE_NOT_FOUND", "Agent profile not found.", 404);
  if (result.shouldEnqueue) await enqueueAgentTick(DEMO_WORKSPACE_ID, { trigger: "CONFIG_CHANGED" }).catch(() => undefined);
  return NextResponse.json({ data: directorConfigResponse(result.profile), scheduledImmediately: result.shouldEnqueue });
}
