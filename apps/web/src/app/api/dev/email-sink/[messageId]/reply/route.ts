import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireDemoSession } from "@/lib/api";
import { processEmailSinkEvent } from "@/lib/reply-loop";
import { DEMO_WORKSPACE_ID, requestAgentDirectorWake } from "@navo/db";
import { enqueueAgentTick } from "@/lib/mission-queue";

const schema = z.object({ subject: z.string().optional(), body: z.string().min(1), eventId: z.string().min(1).optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  if (!(await requireDemoSession())) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return apiError("VALIDATION_ERROR", "Reply body is required.", 422, input.error.flatten());
  const { messageId } = await params;
  const result = await processEmailSinkEvent(messageId, { eventType: "REPLY", ...input.data });
  if (!result) return apiError("MESSAGE_NOT_FOUND", "Outbound EmailSink message was not found.", 404);
  if (!result.duplicate) {
    const wake = await requestAgentDirectorWake({ workspaceId: DEMO_WORKSPACE_ID, trigger: "REPLY_RECEIVED", resourceId: result.message.id });
    if (wake.kind === "WOKEN") await enqueueAgentTick(DEMO_WORKSPACE_ID, { trigger: "REPLY_RECEIVED", resourceId: result.message.id, jobId: `agent-tick-reply-${result.message.id}` }).catch(() => undefined);
  }
  return NextResponse.json({ data: result }, { status: result.duplicate ? 200 : 201 });
}
