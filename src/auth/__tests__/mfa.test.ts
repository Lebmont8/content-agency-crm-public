import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generate, generateSecret } from "otplib";
import type { UserMfaCredential } from "@prisma/client";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  parseAuthCredentialKey,
} from "@/auth/mfa-crypto";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  requiresMfa,
  verifyTotpCode,
} from "@/auth/mfa";

const originalKey = process.env.AUTH_CREDENTIAL_KEY;

beforeEach(() => {
  process.env.AUTH_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString("base64");
});

afterEach(() => {
  if (originalKey == null) delete process.env.AUTH_CREDENTIAL_KEY;
  else process.env.AUTH_CREDENTIAL_KEY = originalKey;
});

describe("privileged MFA", () => {
  it("requires enrollment only for platform admins", () => {
    expect(requiresMfa({ role: "OWNER", isPlatformAdmin: false })).toBe(false);
    expect(requiresMfa({ role: "CHATTER", isPlatformAdmin: true })).toBe(true);
    expect(requiresMfa({ role: "MANAGER", isPlatformAdmin: false })).toBe(false);
    expect(requiresMfa({ role: "CHATTER", isPlatformAdmin: false })).toBe(false);
  });

  it("encrypts each TOTP secret with tenant/user-bound AAD", () => {
    const encrypted = encryptMfaSecret("ABCDEFGHIJKLMNOP", "agency-a", "user-a");
    expect(encrypted.ciphertext).not.toContain("ABCDEFGHIJKLMNOP");
    expect(
      decryptMfaSecret(encrypted, "agency-a", "user-a", 1)
    ).toBe("ABCDEFGHIJKLMNOP");
    expect(() => decryptMfaSecret(encrypted, "agency-b", "user-a", 1)).toThrow();
    expect(parseAuthCredentialKey(process.env.AUTH_CREDENTIAL_KEY!)).toHaveLength(32);
  });

  it("accepts a current TOTP once and rejects replay of the same time step", async () => {
    const secret = generateSecret({ length: 20 });
    const encrypted = encryptMfaSecret(secret, "agency-a", "user-a");
    const base: UserMfaCredential = {
      id: "credential-a",
      agencyId: "agency-a",
      userId: "user-a",
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretAuthTag: encrypted.authTag,
      keyVersion: 1,
      enabledAt: new Date(),
      lastAcceptedStep: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const token = await generate({
      secret,
      strategy: "totp",
      algorithm: "sha1",
      digits: 6,
      period: 30,
    });
    const step = await verifyTotpCode(base, token);
    expect(step).not.toBeNull();
    expect(
      await verifyTotpCode({ ...base, lastAcceptedStep: BigInt(step!) }, token)
    ).toBeNull();
  });

  it("creates ten unique one-time recovery codes and hashes normalized input", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(normalizeRecoveryCode(codes[0])).toHaveLength(20);
    expect(hashRecoveryCode(codes[0])).toBe(
      hashRecoveryCode(codes[0].toLowerCase().replaceAll("-", " "))
    );
    expect(hashRecoveryCode(codes[0])).not.toContain(codes[0]);
  });
});
