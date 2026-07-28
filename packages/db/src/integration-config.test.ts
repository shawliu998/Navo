import { describe, expect, it } from "vitest";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "./integration-config";

const encryptionKey = "ab".repeat(32);

describe("workspace integration credential encryption", () => {
  it("round-trips a provider credential without storing the plaintext", () => {
    const plaintext = "sk-local-provider-secret";
    const encrypted = encryptIntegrationSecret(plaintext, encryptionKey);

    expect(JSON.stringify(encrypted)).not.toContain(plaintext);
    expect(encrypted).toMatchObject({ algorithm: "aes-256-gcm", version: 1 });
    expect(decryptIntegrationSecret(encrypted, encryptionKey)).toBe(plaintext);
  });

  it("rejects an invalid encryption key and cannot decrypt with another key", () => {
    expect(() => encryptIntegrationSecret("secret", "too-short")).toThrow(/64-character hexadecimal/);
    const encrypted = encryptIntegrationSecret("secret", encryptionKey);
    expect(() => decryptIntegrationSecret(encrypted, "cd".repeat(32))).toThrow();
  });
});
