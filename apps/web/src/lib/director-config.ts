import { z } from "zod";

export const directorConfigPatchSchema = z.object({
  enabled: z.boolean().optional(),
  intervalMinutes: z.number().int().min(1).max(1_440).optional(),
  cooldownMinutes: z.number().int().min(0).max(10_080).optional(),
  maxActiveMissions: z.number().int().min(1).max(20).optional(),
  dailyMissionLimit: z.number().int().min(1).max(100).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one Director setting is required.");

export function directorConfigResponse(profile: {
  directorEnabled: boolean;
  directorIntervalMinutes: number;
  directorCooldownMinutes: number;
  directorMaxActiveMissions: number;
  directorDailyMissionLimit: number;
  nextDirectorTickAt: Date | null;
}) {
  return {
    enabled: profile.directorEnabled,
    intervalMinutes: profile.directorIntervalMinutes,
    cooldownMinutes: profile.directorCooldownMinutes,
    maxActiveMissions: profile.directorMaxActiveMissions,
    dailyMissionLimit: profile.directorDailyMissionLimit,
    nextTickAt: profile.nextDirectorTickAt?.toISOString() ?? null,
  };
}
