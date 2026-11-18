import "server-only";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { generateSecret } from "otplib";
import { generateRecoveryCodes, hashRecoveryCode, verifyAndConsumeMfaFactor } from "@/auth/mfa";
import { encryptMfaSecret } from "@/auth/mfa-crypto";
export async function authenticateMfaManagement(agencyId: string, userId: string, password: string, factor: string) {
    const user = await db.user.findUnique({
        where: { id: userId },
        include: { mfaCredential: true },
    });
    if (!user || user.agencyId !== agencyId || !user.mfaCredential?.enabledAt) {
        return null;
    }
    if (!(await verifyPassword(password, user.passwordHash)))
        return null;
    const method = await verifyAndConsumeMfaFactor(user.mfaCredential, factor);
    return method ? { user, credential: user.mfaCredential, method } : null;
}
export async function regenerateMfaRecoveryCodes(agencyId: string, credentialId: string): Promise<string[]> {
    const codes = generateRecoveryCodes();
    await db.$transaction(async (tx) => {
        await tx.mfaRecoveryCode.deleteMany({
            where: { agencyId, credentialId },
        });
        await tx.mfaRecoveryCode.createMany({
            data: codes.map((code) => ({
                agencyId,
                credentialId,
                codeHash: hashRecoveryCode(code),
            })),
        });
    });
    return codes;
}
export async function replaceMfaCredential(user: {
    id: string;
    agencyId: string;
    email: string;
    role: "OWNER" | "MANAGER" | "CHATTER";
    isPlatformAdmin: boolean;
}) {
    const secret = generateSecret({ length: 20 });
    const encrypted = encryptMfaSecret(secret, user.agencyId, user.id);
    await db.$transaction(async (tx) => {
        await tx.mfaChallenge.deleteMany({ where: { userId: user.id } });
        await tx.userMfaCredential.deleteMany({
            where: { agencyId: user.agencyId, userId: user.id },
        });
        await tx.userMfaCredential.create({
            data: {
                agencyId: user.agencyId,
                userId: user.id,
                secretCiphertext: encrypted.ciphertext,
                secretIv: encrypted.iv,
                secretAuthTag: encrypted.authTag,
            },
        });
        await tx.trustedDevice.updateMany({
            where: { agencyId: user.agencyId, userId: user.id, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        await tx.session.deleteMany({ where: { userId: user.id } });
    });
}
