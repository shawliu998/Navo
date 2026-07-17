import { z } from "zod";

const listOf = (max: number, itemMax: number) => z.array(z.string().trim().min(1).max(itemMax)).max(max).default([]);

export const knowledgeClaimSchema = z.object({
  id: z.string().uuid().optional(),
  claim: z.string().trim().min(3).max(500),
  evidence: z.string().trim().max(500).optional(),
  allowedRegions: listOf(20, 60),
});

export const knowledgeInputSchema = z.object({
  company: z.object({
    name: z.string().trim().min(2).max(160),
    website: z.string().trim().max(200).refine((value) => !value || /^https?:\/\/.+/.test(value), "Website must start with http:// or https://").optional(),
    descriptionZh: z.string().trim().max(2_000).optional(),
    descriptionEn: z.string().trim().max(2_000).optional(),
  }),
  product: z.object({
    nameZh: z.string().trim().min(1).max(160),
    nameEn: z.string().trim().min(1).max(160),
    category: z.string().trim().max(120).optional(),
    descriptionZh: z.string().trim().max(2_000).optional(),
    descriptionEn: z.string().trim().max(2_000).optional(),
    capabilities: listOf(30, 120),
    prohibitedClaims: listOf(30, 300),
  }),
  icp: z.object({
    name: z.string().trim().min(2).max(160),
    industries: listOf(30, 120),
    countries: listOf(50, 120),
  }),
  claims: z.array(knowledgeClaimSchema).max(50).default([]),
});

export type KnowledgeInputPayload = z.infer<typeof knowledgeInputSchema>;

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000002";
