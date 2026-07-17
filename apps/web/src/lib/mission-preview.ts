import { missionPlanSchema } from "@navo/agents";
import { z } from "zod";

/** Preview identity is server-produced; both deterministic Mock and configured DeepSeek are accepted. */
export const mockMissionPreviewSchema = z.object({
  plan: missionPlanSchema,
  provider: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
}).strict();

export type MockMissionPreview = z.infer<typeof mockMissionPreviewSchema>;
