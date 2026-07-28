import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createConfiguredAIProvider } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("configured AI provider", () => {
  it("uses an OpenAI-compatible workspace endpoint without DeepSeek-only options", async () => {
    let requestUrl = "";
    let authorization = "";
    let requestBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        id: "configured-test",
        choices: [{ message: { content: JSON.stringify({ status: "ok" }) } }],
        usage: { prompt_tokens: 8, completion_tokens: 3 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const result = await createConfiguredAIProvider({
      provider: "openai-compatible",
      apiKey: "workspace-secret",
      baseUrl: "http://127.0.0.1:43123/v1/",
      model: "local-json-model",
    }).generateStructured({
      operation: "connection-test",
      systemInstruction: "Return the status.",
      input: { purpose: "test" },
      outputSchema: z.object({ status: z.literal("ok") }).strict(),
      promptVersion: "connection-test-v1",
    });

    expect(requestUrl).toBe("http://127.0.0.1:43123/v1/chat/completions");
    expect(authorization).toBe("Bearer workspace-secret");
    expect(requestBody).toMatchObject({
      model: "local-json-model",
      response_format: { type: "json_object" },
    });
    expect(requestBody).not.toHaveProperty("thinking");
    expect(result).toMatchObject({ provider: "openai-compatible", model: "local-json-model", data: { status: "ok" } });
  });
});
