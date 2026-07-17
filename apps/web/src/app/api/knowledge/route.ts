import { DEMO_WORKSPACE_ID, getKnowledgeBase, saveKnowledgeBase } from "@navo/db/queries";
import { NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";
import { DEMO_USER_ID, knowledgeInputSchema } from "./_shared";

export async function GET() {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const data = await getKnowledgeBase(DEMO_WORKSPACE_ID);
  if (!data.company) return apiError("WORKSPACE_NOT_FOUND", "Demo workspace is missing.", 404);
  return NextResponse.json({ data, meta: { workspaceId: DEMO_WORKSPACE_ID } });
}

export async function PUT(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = knowledgeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_KNOWLEDGE", "Knowledge input is invalid.", 422, parsed.error.flatten());
  try {
    const data = await saveKnowledgeBase(DEMO_WORKSPACE_ID, DEMO_USER_ID, parsed.data);
    return NextResponse.json({ data, meta: { workspaceId: DEMO_WORKSPACE_ID } });
  } catch {
    return apiError("KNOWLEDGE_SAVE_FAILED", "Knowledge could not be saved. Please try again.", 500);
  }
}
