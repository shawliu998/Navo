import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireDemoSession } from "@/lib/api";
import { deterministicCommandProposal } from "../../../missions/_shared";

const inputSchema = z.object({ command: z.string().trim().min(8).max(2_000) });

export async function POST(request: Request) {
  if (!await requireDemoSession()) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_COMMAND", "Tell Navo what outcome you want.", 422, parsed.error.flatten());
  return NextResponse.json({ data: deterministicCommandProposal(parsed.data.command) });
}
