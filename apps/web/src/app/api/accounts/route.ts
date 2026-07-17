import { NextRequest, NextResponse } from "next/server";
import { DEMO_WORKSPACE_ID, getAccounts } from "@navo/db/queries";
import { apiError, requireDemoSession } from "@/lib/api";
export async function GET(request:NextRequest){if(!await requireDemoSession())return apiError("UNAUTHENTICATED","Login required.",401);const items=await getAccounts(DEMO_WORKSPACE_ID,request.nextUrl.searchParams.get("q")??"");return NextResponse.json({data:items,meta:{workspaceId:DEMO_WORKSPACE_ID,count:items.length}})}
