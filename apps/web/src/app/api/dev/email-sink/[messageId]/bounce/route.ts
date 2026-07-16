import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireDemoSession } from "@/lib/api";
import { processEmailSinkEvent } from "@/lib/reply-loop";

const schema = z.object({ body: z.string().optional(), eventId: z.string().min(1).optional() }).default({});
export async function POST(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  if (!(await requireDemoSession())) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const input = schema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return apiError("VALIDATION_ERROR", "Invalid bounce event.", 422, input.error.flatten());
  const { messageId } = await params;
  const result = await processEmailSinkEvent(messageId, { eventType: "BOUNCE", ...input.data });
  if (!result) return apiError("MESSAGE_NOT_FOUND", "Outbound EmailSink message was not found.", 404);
  return NextResponse.json({ data: result }, { status: result.duplicate ? 200 : 201 });
}
