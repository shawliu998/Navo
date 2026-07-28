import { describe, expect, it } from "vitest";
import {
  workspaceAIConnectionSchema,
  workspaceAIConnectionTestSchema,
} from "../src/lib/integration-settings";

describe("workspace AI connection input", () => {
  it("accepts DeepSeek and local OpenAI-compatible endpoints", () => {
    expect(workspaceAIConnectionSchema.parse({
      provider: "deepseek",
      apiKey: "sk-deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    })).toMatchObject({ provider: "deepseek" });

    expect(workspaceAIConnectionSchema.parse({
      provider: "openai-compatible",
      apiKey: "local-key",
      baseUrl: "http://127.0.0.1:43123/v1",
      model: "local-json-model",
    })).toMatchObject({ provider: "openai-compatible" });
  });

  it("rejects insecure remote URLs, blank credentials, and unknown providers", () => {
    expect(workspaceAIConnectionSchema.safeParse({
      provider: "deepseek",
      apiKey: "",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    }).success).toBe(false);
    expect(workspaceAIConnectionSchema.safeParse({
      provider: "openai-compatible",
      apiKey: "key",
      baseUrl: "http://example.com/v1",
      model: "model",
    }).success).toBe(false);
    expect(workspaceAIConnectionTestSchema.safeParse({ provider: "unsupported" }).success).toBe(false);
  });

  it("allows an omitted key when updating an existing connection", () => {
    expect(workspaceAIConnectionSchema.safeParse({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    }).success).toBe(true);
  });
});
