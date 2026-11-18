import crypto from "node:crypto";
import { z } from "zod";
export type EncryptedPayload = {
    ciphertext: string;
    iv: string;
    authTag: string;
};
export const platformTokenSchema = z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    idToken: z.string().min(1).optional(),
    expiresAt: z.number().int().positive(),
    scopes: z.array(z.string().min(1)),
});
export type PlatformTokenPayload = z.infer<typeof platformTokenSchema>;
export function parseCredentialKey(value: string): Buffer {
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) {
        throw new Error("PLATFORM_CREDENTIAL_KEY must be exactly 32 bytes in base64");
    }
    return key;
}
export function encryptJson(value: unknown, key: Buffer, aad: string): EncryptedPayload {
    if (key.length !== 32)
        throw new Error("AES-256-GCM requires a 32-byte key");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final(),
    ]);
    return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
    };
}
export function decryptJson(encrypted: EncryptedPayload, key: Buffer, aad: string): unknown {
    if (key.length !== 32)
        throw new Error("AES-256-GCM requires a 32-byte key");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
        decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as unknown;
}
export function credentialAad(agencyId: string, connectionId: string, keyVersion: number): string {
    return `platform-credential:${agencyId}:${connectionId}:v${keyVersion}`;
}
