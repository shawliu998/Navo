import { z } from "zod";

export const draftMessagePatchSchema = z.object({
  subject: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(4_000),
});

export function canEditDraftMessage(message: { direction: string; status: string }) {
  return message.direction === "OUTBOUND" && message.status === "DRAFT";
}

export const matchesDraftRevision = (currentRevision: string, submittedRevision: string) => currentRevision === submittedRevision;
export const preserveOriginalDraft = (original: string | null, current: string) => original ?? current;
