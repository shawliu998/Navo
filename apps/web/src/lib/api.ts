import { cookies } from "next/headers";
import { NextResponse } from "next/server";
export async function requireDemoSession(){const store=await cookies();return store.get("exportplay_session")?.value==="demo-owner"}
export function apiError(code:string,message:string,status=400,details:unknown={}){return NextResponse.json({error:{code,message,details,requestId:crypto.randomUUID()}},{status})}
