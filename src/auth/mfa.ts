import "server-only";
import crypto from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import type { Role, UserMfaCredential } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptMfaSecret, encryptMfaSecret } from "@/auth/mfa-crypto";
export const MFA_ISSUER = "Content Agency CRM";
export const MFA_RECOVERY_CODE_COUNT = 10;
type PrivilegedUser = {
    id: string;
    agencyId: string;
    email: string;
    role: Role;
    isPlatformAdmin: boolean;
};
export function requiresMfa(user: Pick<PrivilegedUser, "role" | "isPlatformAdmin">) {
    return user.isPlatformAdmin;
}
export function shouldChallengeMfa(user: Pick<PrivilegedUser, "role" | "isPlatformAdmin"> & {
    mfaCredential?: Pick<UserMfaCredential, "enabledAt"> | null;
}) {
    return requiresMfa(user) || Boolean(user.mfaCredential?.enabledAt);
}
export async function ensurePendingMfaCredential(user: PrivilegedUser) {
    const existing = await db.userMfaCredential.findUnique({
        where: { agencyId_userId: { agencyId: user.agencyId, userId: user.id } },
    });
    if (existing)
        return existing;
    const secret = generateSecret({ length: 20 });
    const encrypted = encryptMfaSecret(secret, user.agencyId, user.id);
    return db.userMfaCredential.create({
        data: {
            agencyId: user.agencyId,
            userId: user.id,
            secretCiphertext: encrypted.ciphertext,
            secretIv: encrypted.iv,
            secretAuthTag: encrypted.authTag,
        },
    });
}
export function readCredentialSecret(credential: UserMfaCredential): string {
    return decryptMfaSecret({
        ciphertext: credential.secretCiphertext,
        iv: credential.secretIv,
        authTag: credential.secretAuthTag,
    }, credential.agencyId, credential.userId, credential.keyVersion);
}
export function mfaSetupUri(email: string, secret: string): string {
    return generateURI({
        issuer: MFA_ISSUER,
        label: email,
        secret,
        algorithm: "sha1",
        digits: 6,
        period: 30,
    });
}
export async function verifyTotpCode(credential: UserMfaCredential, token: string): Promise<number | null> {
    if (!/^\d{6}$/.test(token))
        return null;
    const result = await verify({
        secret: readCredentialSecret(credential),
        token,
        strategy: "totp",
        algorithm: "sha1",
        digits: 6,
        period: 30,
        epochTolerance: 30,
        afterTimeStep: credential.lastAcceptedStep == null
            ? undefined
            : Number(credential.lastAcceptedStep),
    });
    return result.valid && "timeStep" in result ? result.timeStep : null;
}
export function normalizeRecoveryCode(code: string): string {
    return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function hashRecoveryCode(code: string): string {
    return crypto
        .createHash("sha256")
        .update(normalizeRecoveryCode(code), "utf8")
        .digest("hex");
}
export function generateRecoveryCodes(count = MFA_RECOVERY_CODE_COUNT): string[] {
    return Array.from({ length: count }, () => {
        const raw = crypto.randomBytes(10).toString("hex").toUpperCase();
        return raw.match(/.{1,4}/g)?.join("-") ?? raw;
    });
}
export async function verifyAndConsumeMfaFactor(credential: UserMfaCredential, code: string, now = new Date()): Promise<"totp" | "recovery" | null> {
    const timeStep = await verifyTotpCode(credential, code.trim());
    if (timeStep != null) {
        const updated = await db.userMfaCredential.updateMany({
            where: {
                id: credential.id,
                agencyId: credential.agencyId,
                OR: [
                    { lastAcceptedStep: null },
                    { lastAcceptedStep: { lt: BigInt(timeStep) } },
                ],
            },
            data: { lastAcceptedStep: BigInt(timeStep) },
        });
        return updated.count === 1 ? "totp" : null;
    }
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length !== 20)
        return null;
    const consumed = await db.mfaRecoveryCode.updateMany({
        where: {
            agencyId: credential.agencyId,
            credentialId: credential.id,
            codeHash: hashRecoveryCode(normalized),
            usedAt: null,
        },
        data: { usedAt: now },
    });
    return consumed.count === 1 ? "recovery" : null;
}
