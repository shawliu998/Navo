import { DEMO_WORKSPACE_ID, getAgentMemory } from "@navo/db/queries";
import { NextRequest, NextResponse } from "next/server";
import { apiError, requireDemoSession } from "@/lib/api";

export async function GET(request: NextRequest) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
  if (accountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) return apiError("INVALID_ACCOUNT_ID", "accountId must be a UUID.", 422);
  return NextResponse.json({ data: await getAgentMemory(DEMO_WORKSPACE_ID, accountId) });
}
