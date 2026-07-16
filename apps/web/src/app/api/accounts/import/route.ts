import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { dedupeAccountKey, normalizeDomain } from "@exportplay/domain";
import { accounts, auditLogs, db, importJobs, importRows } from "@exportplay/db";
import { DEMO_WORKSPACE_ID } from "@exportplay/db/queries";
import { apiError, requireDemoSession } from "@/lib/api";

const rowSchema = z.object({ companyName: z.string().min(1), website: z.string().optional(), country: z.string().optional(), industry: z.string().optional(), externalId: z.string().optional() });
const schema = z.object({ fileName: z.string().min(1).default("accounts.csv"), mapping: z.record(z.string(), z.string()), rows: z.array(rowSchema).min(1).max(500) });

export async function POST(request: NextRequest) {
  if (!(await requireDemoSession())) return apiError("UNAUTHENTICATED", "Login required.", 401);
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return apiError("VALIDATION_ERROR", "Invalid CSV import payload.", 422, input.error.flatten());
  const result = await db.transaction(async (tx) => {
    const [job] = await tx.insert(importJobs).values({ workspaceId: DEMO_WORKSPACE_ID, name: input.data.fileName, status: "RUNNING", data: { mapping: input.data.mapping, rowCount: input.data.rows.length } }).returning();
    if (!job) throw new Error("Import job could not be created.");
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const [index, row] of input.data.rows.entries()) {
      const domain = normalizeDomain(row.website ?? "");
      const dedupeKey = dedupeAccountKey(row);
      const [existing] = domain ? await tx.select().from(accounts).where(and(eq(accounts.workspaceId, DEMO_WORKSPACE_ID), eq(accounts.domain, domain))).limit(1) : [];
      let status = "CREATED";
      let accountId: string | null = null;
      if (existing) {
        await tx.update(accounts).set({ name: row.companyName, website: row.website || existing.website, country: row.country || existing.country, industry: row.industry || existing.industry, updatedAt: new Date(), revision: existing.revision + 1 }).where(eq(accounts.id, existing.id));
        updated += 1;
        status = "UPDATED";
        accountId = existing.id;
      } else if (!domain && !row.externalId && !row.country) {
        skipped += 1;
        status = "SKIPPED_MISSING_DEDUPE_KEY";
      } else {
        const [createdAccount] = await tx.insert(accounts).values({ workspaceId: DEMO_WORKSPACE_ID, name: row.companyName, domain: domain || null, website: row.website || null, country: row.country || null, industry: row.industry || null, source: "CSV_IMPORT", ownerName: "刘晓岚" }).returning();
        created += 1;
        accountId = createdAccount?.id ?? null;
      }
      await tx.insert(importRows).values({ workspaceId: DEMO_WORKSPACE_ID, name: `Row ${index + 1}`, status, data: { jobId: job.id, accountId, dedupeKey, row } });
    }
    await tx.update(importJobs).set({ status: "COMPLETED", data: { mapping: input.data.mapping, rowCount: input.data.rows.length, created, updated, skipped }, updatedAt: new Date() }).where(eq(importJobs.id, job.id));
    await tx.insert(auditLogs).values({ workspaceId: DEMO_WORKSPACE_ID, actorName: "刘晓岚", action: "ACCOUNT_CSV_IMPORTED", resourceType: "IMPORT_JOB", resourceId: job.id, requestId: crypto.randomUUID(), summary: `${created} created, ${updated} updated, ${skipped} skipped`, metadata: { fileName: input.data.fileName } });
    return { jobId: job.id, created, updated, skipped };
  });
  return NextResponse.json({ data: result }, { status: 201 });
}
