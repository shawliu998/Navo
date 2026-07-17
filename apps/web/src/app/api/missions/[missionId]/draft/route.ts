import { DEMO_WORKSPACE_ID, updateMissionDraftMessage } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { draftMessagePatchSchema } from "@/lib/draft-message";
import { DEMO_USER_ID } from "../../_shared";
import { z } from "zod";

const inputSchema = draftMessagePatchSchema.extend({ messageId: z.string().uuid(), revision: z.string().datetime() });

export async function PATCH(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_DRAFT", "Subject, body, and current draft revision are required.", 422, parsed.error.flatten());
  const { missionId } = await params;
  const result = await updateMissionDraftMessage(DEMO_WORKSPACE_ID, DEMO_USER_ID, missionId, parsed.data.messageId, parsed.data);
  if (result.kind === "MISSION_NOT_FOUND") return apiError("MISSION_NOT_FOUND", "Mission was not found in this workspace.", 404);
  if (result.kind === "MESSAGE_NOT_IN_MISSION") return apiError("MESSAGE_NOT_IN_MISSION", "This DRAFT does not belong to the mission.", 409);
  if (result.kind === "NOT_FOUND") return apiError("MESSAGE_NOT_FOUND", "Message was not found in this workspace.", 404);
  if (result.kind === "NOT_EDITABLE") return apiError("MESSAGE_NOT_EDITABLE", "Only outbound DRAFT messages can be edited.", 409);
  if (result.kind === "CONFLICT") return apiError("DRAFT_CONFLICT", "This DRAFT changed elsewhere. Refresh before saving.", 409, { revision: result.revision });
  return NextResponse.json({ data: result.message, meta: { firstEdit: result.firstEdit, revision: result.revision, noSend: true } });
}
