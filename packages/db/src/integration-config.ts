import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./client";
import { integrationConnections } from "./schema";

export type WorkspaceAIProviderId = "deepseek" | "openai-compatible";

type EncryptedSecret = {
  algorithm: "aes-256-gcm";
  ciphertext: string;
  iv: string;
  tag: string;
  version: 1;
};

type AIConnectionConfig = {
  baseUrl?: string;
  credential?: EncryptedSecret;
  isDefault?: boolean;
  keyHint?: string;
  lastError?: string | null;
  model?: string;
  testedAt?: string | null;
};

export type WorkspaceAIConnectionInput = {
  apiKey?: string;
  baseUrl: string;
  model: string;
  provider: WorkspaceAIProviderId;
};

export type WorkspaceAIConnectionSummary = {
  baseUrl: string;
  hasCredential: boolean;
  isDefault: boolean;
  keyHint: string | null;
  lastError: string | null;
  model: string;
  provider: WorkspaceAIProviderId;
  status: string;
  testedAt: string | null;
};

export type WorkspaceAIConnectionRuntime = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: WorkspaceAIProviderId;
};

const providerId = (value: string): WorkspaceAIProviderId | null => {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "deepseek") return "deepseek";
  if (normalized === "openai-compatible" || normalized === "openai compatible") return "openai-compatible";
  return null;
};

function encryptionKey(value = process.env.NAVO_ENCRYPTION_KEY) {
  const normalized = value?.trim();
  if (!normalized || !/^[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error("NAVO_ENCRYPTION_KEY must be a 64-character hexadecimal value. Run pnpm bootstrap.");
  }
  return Buffer.from(normalized, "hex");
}

export function encryptIntegrationSecret(secret: string, key?: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    version: 1,
  };
}

export function decryptIntegrationSecret(secret: EncryptedSecret, key?: string) {
  if (secret.algorithm !== "aes-256-gcm" || secret.version !== 1) throw new Error("Unsupported integration credential format.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(key), Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

const configFor = (value: unknown): AIConnectionConfig => value && typeof value === "object" ? value as AIConnectionConfig : {};
const keyHint = (value: string) => value.length > 4 ? `••••${value.slice(-4)}` : "••••";

export async function getWorkspaceAIConnections(workspaceId: string): Promise<WorkspaceAIConnectionSummary[]> {
  const rows = await db.select().from(integrationConnections)
    .where(and(eq(integrationConnections.workspaceId, workspaceId), eq(integrationConnections.category, "AI")))
    .orderBy(asc(integrationConnections.provider));
  return rows.flatMap((row) => {
    const provider = providerId(row.provider);
    if (!provider) return [];
    const config = configFor(row.config);
    return [{
      provider,
      status: row.status,
      baseUrl: config.baseUrl ?? "",
      model: config.model ?? "",
      hasCredential: Boolean(config.credential),
      keyHint: config.keyHint ?? null,
      isDefault: config.isDefault === true,
      testedAt: config.testedAt ?? null,
      lastError: config.lastError ?? null,
    }];
  });
}

export async function saveWorkspaceAIConnection(workspaceId: string, userId: string, input: WorkspaceAIConnectionInput) {
  const rows = await db.select().from(integrationConnections)
    .where(and(eq(integrationConnections.workspaceId, workspaceId), eq(integrationConnections.category, "AI")));
  const existing = rows.find((row) => providerId(row.provider) === input.provider);
  const existingConfig = configFor(existing?.config);
  const apiKey = input.apiKey?.trim();
  const credential = apiKey ? encryptIntegrationSecret(apiKey) : existingConfig.credential;
  if (!credential) throw new Error("An API key is required for a new AI connection.");

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const config = configFor(row.config);
      if (config.isDefault === true && row.id !== existing?.id) {
        await tx.update(integrationConnections).set({ config: { ...config, isDefault: false }, updatedAt: new Date() })
          .where(and(eq(integrationConnections.workspaceId, workspaceId), eq(integrationConnections.id, row.id)));
      }
    }
    const config: AIConnectionConfig = {
      ...existingConfig,
      baseUrl: input.baseUrl.trim().replace(/\/$/, ""),
      credential,
      isDefault: true,
      keyHint: apiKey ? keyHint(apiKey) : existingConfig.keyHint,
      lastError: null,
      model: input.model.trim(),
      testedAt: null,
    };
    if (existing) {
      await tx.update(integrationConnections).set({
        provider: input.provider,
        status: "CONFIGURED",
        permissions: ["ai:generate-structured"],
        config,
        updatedAt: new Date(),
      }).where(and(eq(integrationConnections.workspaceId, workspaceId), eq(integrationConnections.id, existing.id)));
    } else {
      await tx.insert(integrationConnections).values({
        workspaceId,
        createdBy: userId,
        provider: input.provider,
        category: "AI",
        status: "CONFIGURED",
        permissions: ["ai:generate-structured"],
        config,
      });
    }
  });

  return (await getWorkspaceAIConnections(workspaceId)).find((connection) => connection.provider === input.provider)!;
}

export async function getWorkspaceAIConnectionRuntime(
  workspaceId: string,
  requestedProvider?: string | null,
  allowConfigured = false,
): Promise<WorkspaceAIConnectionRuntime | null> {
  const rows = await db.select().from(integrationConnections)
    .where(and(eq(integrationConnections.workspaceId, workspaceId), eq(integrationConnections.category, "AI")));
  const requested = requestedProvider ? providerId(requestedProvider) : null;
  const usable = (status: string) => status === "CONNECTED" || (allowConfigured && status === "CONFIGURED");
  const row = rows.find((item) => {
    const config = configFor(item.config);
    return providerId(item.provider) === requested && usable(item.status) && Boolean(config.credential);
  }) ?? rows.find((item) => {
    const config = configFor(item.config);
    return config.isDefault === true && usable(item.status) && Boolean(config.credential);
  });
  if (!row) return null;
  const provider = providerId(row.provider);
  const config = configFor(row.config);
  if (!provider || !config.credential || !config.baseUrl || !config.model) return null;
  return { provider, apiKey: decryptIntegrationSecret(config.credential), baseUrl: config.baseUrl, model: config.model };
}

export async function markWorkspaceAIConnectionTest(
  workspaceId: string,
  provider: WorkspaceAIProviderId,
  outcome: { error?: string; ok: boolean },
) {
  const rows = await db.select().from(integrationConnections)
    .where(and(eq(integrationConnections.workspaceId, workspaceId), eq(integrationConnections.category, "AI")));
  const row = rows.find((item) => providerId(item.provider) === provider);
  if (!row) return null;
  const testedAt = new Date();
  const config = configFor(row.config);
  await db.update(integrationConnections).set({
    status: outcome.ok ? "CONNECTED" : "ERROR",
    lastSyncAt: outcome.ok ? testedAt : row.lastSyncAt,
    config: { ...config, testedAt: testedAt.toISOString(), lastError: outcome.ok ? null : outcome.error ?? "Connection test failed." },
    updatedAt: testedAt,
  }).where(and(eq(integrationConnections.workspaceId, workspaceId), eq(integrationConnections.id, row.id)));
  return (await getWorkspaceAIConnections(workspaceId)).find((connection) => connection.provider === provider) ?? null;
}
