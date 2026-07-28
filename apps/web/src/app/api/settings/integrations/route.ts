import { NextResponse } from "next/server";
import {
  DEMO_WORKSPACE_ID,
  getWorkspaceAIConnections,
  saveWorkspaceAIConnection,
} from "@navo/db";
import { apiError, requireDemoSession } from "@/lib/api";
import { workspaceAIConnectionSchema } from "@/lib/integration-settings";
import { DEMO_USER_ID } from "../../missions/_shared";

export async function GET() {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const data = await getWorkspaceAIConnections(DEMO_WORKSPACE_ID);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = workspaceAIConnectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_AI_CONNECTION", "AI connection settings are invalid.", 422, parsed.error.flatten());
  try {
    const data = await saveWorkspaceAIConnection(DEMO_WORKSPACE_ID, DEMO_USER_ID, parsed.data);
    return NextResponse.json({ data }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "AI connection could not be saved.";
    return apiError("AI_CONNECTION_SAVE_FAILED", message, 500);
  }
}
