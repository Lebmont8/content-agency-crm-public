import "server-only";
import { z } from "zod";
import { decryptJson, encryptJson, type EncryptedPayload } from "@/platform/secrets/credential-crypto";
const secretPayloadSchema = z.object({ secret: z.string().min(16) });
export function parseAuthCredentialKey(value: string): Buffer {
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) {
        throw new Error("AUTH_CREDENTIAL_KEY must be exactly 32 bytes in base64");
    }
    return key;
}
export function getAuthCredentialKey(): Buffer {
    const value = process.env.AUTH_CREDENTIAL_KEY;
    if (!value)
        throw new Error("AUTH_CREDENTIAL_KEY is required for privileged MFA");
    return parseAuthCredentialKey(value);
}
export function mfaSecretAad(agencyId: string, userId: string, keyVersion: number): string {
    return `user-mfa:${agencyId}:${userId}:v${keyVersion}`;
}
export function encryptMfaSecret(secret: string, agencyId: string, userId: string, keyVersion = 1): EncryptedPayload {
    return encryptJson({ secret }, getAuthCredentialKey(), mfaSecretAad(agencyId, userId, keyVersion));
}
export function decryptMfaSecret(encrypted: EncryptedPayload, agencyId: string, userId: string, keyVersion: number): string {
    return secretPayloadSchema.parse(decryptJson(encrypted, getAuthCredentialKey(), mfaSecretAad(agencyId, userId, keyVersion))).secret;
}
