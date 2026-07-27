import { missionPlanSchema } from "@navo/agents";
import { z } from "zod";

/** Preview identity is server-produced; both deterministic Mock and configured DeepSeek are accepted. */
export const mockMissionPreviewSchema = z.object({
  plan: missionPlanSchema,
  provider: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  plannerMode: z.enum(["AI", "DETERMINISTIC_FALLBACK"]).default("AI"),
  fallbackReason: z.string().trim().max(2_000).nullable().default(null),
}).strict();

export type MockMissionPreview = z.infer<typeof mockMissionPreviewSchema>;
