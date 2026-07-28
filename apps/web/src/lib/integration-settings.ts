import { z } from "zod";

export const workspaceAIConnectionSchema = z.object({
  provider: z.enum(["deepseek", "openai-compatible"]),
  apiKey: z.string().trim().min(1).max(512).optional(),
  baseUrl: z.string().trim().url().max(500),
  model: z.string().trim().min(1).max(160),
}).strict().superRefine((value, context) => {
  const url = new URL(value.baseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    context.addIssue({ code: "custom", path: ["baseUrl"], message: "Use HTTPS unless the endpoint is local." });
  }
});

export const workspaceAIConnectionTestSchema = z.object({
  provider: z.enum(["deepseek", "openai-compatible"]),
}).strict();

export const AI_PROVIDER_PRESETS = {
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    description: "Native structured generation through DeepSeek Chat Completions.",
  },
  "openai-compatible": {
    label: "OpenAI-compatible",
    baseUrl: "",
    model: "",
    description: "A custom Chat Completions endpoint with JSON object output.",
  },
} as const;

export function integrationErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
