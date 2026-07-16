import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, plays, playVersions } from "@exportplay/db";
import { DEMO_WORKSPACE_ID } from "@exportplay/db/queries";
import { apiError, requireDemoSession } from "@/lib/api";
const graphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      label: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      config: z.record(z.string(), z.unknown()),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      branch: z.string().optional(),
    }),
  ),
});
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playId: string }> },
) {
  if (!(await requireDemoSession()))
    return apiError("UNAUTHENTICATED", "Login required.", 401);
  const { playId } = await params;
  const parsed = graphSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError(
      "VALIDATION_ERROR",
      "Invalid play graph.",
      422,
      parsed.error.flatten(),
    );
  const result = await db.transaction(async (tx) => {
    const [play] = await tx
      .select()
      .from(plays)
      .where(
        and(eq(plays.workspaceId, DEMO_WORKSPACE_ID), eq(plays.id, playId)),
      )
      .limit(1);
    if (!play) return null;
    if (play.draftVersionId) {
      await tx
        .update(playVersions)
        .set({
          graph: parsed.data,
          updatedAt: new Date(),
          revision: sql`${playVersions.revision}+1`,
        })
        .where(
          and(
            eq(playVersions.workspaceId, DEMO_WORKSPACE_ID),
            eq(playVersions.id, play.draftVersionId),
          ),
        );
      return play.draftVersionId;
    }
    const [latest] = await tx
      .select()
      .from(playVersions)
      .where(
        and(
          eq(playVersions.workspaceId, DEMO_WORKSPACE_ID),
          eq(playVersions.playId, playId),
        ),
      )
      .orderBy(desc(playVersions.versionNumber))
      .limit(1);
    const [version] = await tx
      .insert(playVersions)
      .values({
        workspaceId: DEMO_WORKSPACE_ID,
        createdBy: play.createdBy,
        playId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: "DRAFT",
        basedOnVersionId: play.activeVersionId,
        graph: parsed.data,
        graphHash: `draft-${Date.now()}`,
      })
      .returning();
    await tx
      .update(plays)
      .set({
        draftVersionId: version!.id,
        status: "DRAFT",
        updatedAt: new Date(),
        revision: sql`${plays.revision}+1`,
      })
      .where(
        and(eq(plays.workspaceId, DEMO_WORKSPACE_ID), eq(plays.id, playId)),
      );
    return version!.id;
  });
  if (!result) return apiError("NOT_FOUND", "Play not found.", 404);
  return NextResponse.json({ data: { draftVersionId: result } });
}
