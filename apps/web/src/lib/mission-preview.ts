import { missionPlanSchema } from "@navo/agents";
import { z } from "zod";

/** The demo accepts only the deterministic provider identity emitted by preview. */
export const mockMissionPreviewSchema = z.object({
  plan: missionPlanSchema,
  provider: z.literal("mock-ai"),
  model: z.literal("deterministic-v1"),
}).strict();

export type MockMissionPreview = z.infer<typeof mockMissionPreviewSchema>;
