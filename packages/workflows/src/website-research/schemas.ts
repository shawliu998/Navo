import { z } from "zod";

export const websiteResearchInputSchema = z.object({
  accountId: z.string().trim().min(1).max(200),
  accountName: z.string().trim().min(1).max(500).optional(),
  websiteUrl: z.string().trim().min(1).max(2_048),
  focus: z.enum(["COMPANY", "CONTACTS"]).default("COMPANY"),
}).strict();

export const websiteResearchPageSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  text: z.string(),
  fetchedAt: z.string().datetime(),
  contentTrust: z.literal("untrusted"),
});

export const websiteResearchDataSchema = z.object({
  accountId: z.string(),
  inputUrl: z.string(),
  finalUrl: z.string().url(),
  fetchedAt: z.string().datetime(),
  pages: z.array(websiteResearchPageSchema).min(1).max(5),
});

export const websiteResearchErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "INVALID_URL",
  "UNSUPPORTED_PROTOCOL",
  "CREDENTIALS_NOT_ALLOWED",
  "BLOCKED_HOSTNAME",
  "BLOCKED_ADDRESS",
  "DNS_FAILED",
  "TOO_MANY_REDIRECTS",
  "EXTERNAL_REDIRECT",
  "HTTP_ERROR",
  "UNSUPPORTED_CONTENT_TYPE",
  "RESPONSE_TOO_LARGE",
  "TIMEOUT",
  "FETCH_FAILED",
]);

export const websiteResearchErrorSchema = z.object({
  code: websiteResearchErrorCodeSchema,
  message: z.string(),
  url: z.string().optional(),
  status: z.number().int().optional(),
});

export const websiteResearchOutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: websiteResearchDataSchema }),
  z.object({ ok: z.literal(false), error: websiteResearchErrorSchema }),
]);

export type WebsiteResearchInput = z.input<typeof websiteResearchInputSchema>;
export type WebsiteResearchPage = z.infer<typeof websiteResearchPageSchema>;
export type WebsiteResearchData = z.infer<typeof websiteResearchDataSchema>;
export type WebsiteResearchError = z.infer<typeof websiteResearchErrorSchema>;
export type WebsiteResearchErrorCode = z.infer<typeof websiteResearchErrorCodeSchema>;
export type WebsiteResearchOutput = z.infer<typeof websiteResearchOutputSchema>;
