"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { generateRecoveryCodes, hashRecoveryCode, verifyAndConsumeMfaFactor, verifyTotpCode } from "@/auth/mfa";
import { clearMfaChallengeCookie, consumeMfaChallenge, getMfaChallenge, recordMfaFailure } from "@/auth/mfa-challenge";
import { logAudit } from "@/domain/audit";
import { createTrustedDevice } from "@/auth/trusted-device";
export type MfaActionState = {
    error?: string;
    recoveryCodes?: string[];
    continueUrl?: string;
} | null;
const codeSchema = z.object({ code: z.string().min(6).max(64) });
class MfaSetupConflict extends Error {
}
async function destinationFor(user: {
    agencyId: string;
    role: "OWNER" | "MANAGER" | "CHATTER";
    isPlatformAdmin: boolean;
}): Promise<string> {
    if (user.isPlatformAdmin)
        return "/admin";
    if (user.role !== "CHATTER") {
        const count = await getTenantDb(user.agencyId).creatorAccount.count();
        if (count === 0)
            return "/onboarding";
    }
    return "/inbox";
}
export async function completeMfaLogin(_prev: MfaActionState, formData: FormData): Promise<MfaActionState> {
    const parsed = codeSchema.safeParse(Object.fromEntries(formData));
    const challenge = await getMfaChallenge();
    if (!parsed.success || !challenge || challenge.purpose !== "LOGIN") {
        return { error: "Invalid or expired verification challenge" };
    }
    const credential = challenge.user.mfaCredential;
    if (!credential?.enabledAt) {
        return { error: "MFA setup is incomplete" };
    }
    const method = await verifyAndConsumeMfaFactor(credential, parsed.data.code.trim());
    if (!method) {
        await recordMfaFailure(challenge.id);
        return { error: "Invalid or expired verification code" };
    }
    if (!(await consumeMfaChallenge(challenge.id))) {
        return { error: "Invalid or expired verification challenge" };
    }
    await clearMfaChallengeCookie();
    const trustedDevice = challenge.rememberDevice
        ? await createTrustedDevice(challenge.user)
        : null;
    await createSession(challenge.user.id, {
        persistent: challenge.rememberDevice,
        trustedDeviceId: trustedDevice?.id,
    });
    await logAudit(getTenantDb(challenge.agencyId), challenge.agencyId, {
        actorId: challenge.user.id,
        action: method === "recovery" ? "auth.mfa_recovery" : "auth.mfa_login",
        entityType: "User",
        entityId: challenge.user.id,
        after: { method, rememberedDevice: !!trustedDevice },
    });
    if (trustedDevice) {
        await logAudit(getTenantDb(challenge.agencyId), challenge.agencyId, {
            actorId: challenge.user.id,
            action: "auth.trusted_device_created",
            entityType: "TrustedDevice",
            entityId: trustedDevice.id,
            after: { label: trustedDevice.label },
        });
    }
    redirect(await destinationFor(challenge.user));
}
export async function completeMfaSetup(_prev: MfaActionState, formData: FormData): Promise<MfaActionState> {
    const parsed = codeSchema.safeParse(Object.fromEntries(formData));
    const challenge = await getMfaChallenge();
    if (!parsed.success || !challenge || challenge.purpose !== "SETUP") {
        return { error: "Invalid or expired verification challenge" };
    }
    const credential = challenge.user.mfaCredential;
    if (!credential || credential.enabledAt) {
        return { error: "MFA setup is no longer available" };
    }
    const timeStep = await verifyTotpCode(credential, parsed.data.code.trim());
    if (timeStep == null) {
        await recordMfaFailure(challenge.id);
        return { error: "Invalid or expired verification code" };
    }
    const now = new Date();
    const recoveryCodes = generateRecoveryCodes();
    let enabled = true;
    try {
        await db.$transaction(async (tx) => {
            const credentialUpdate = await tx.userMfaCredential.updateMany({
                where: {
                    id: credential.id,
                    agencyId: challenge.agencyId,
                    enabledAt: null,
                    OR: [
                        { lastAcceptedStep: null },
                        { lastAcceptedStep: { lt: BigInt(timeStep) } },
                    ],
                },
                data: { enabledAt: now, lastAcceptedStep: BigInt(timeStep) },
            });
            if (credentialUpdate.count !== 1)
                throw new MfaSetupConflict();
            const challengeUpdate = await tx.mfaChallenge.updateMany({
                where: {
                    id: challenge.id,
                    consumedAt: null,
                    expiresAt: { gt: now },
                    attemptCount: { lt: challenge.maxAttempts },
                },
                data: { consumedAt: now },
            });
            if (challengeUpdate.count !== 1)
                throw new MfaSetupConflict();
            await tx.mfaRecoveryCode.deleteMany({
                where: { agencyId: challenge.agencyId, credentialId: credential.id },
            });
            await tx.mfaRecoveryCode.createMany({
                data: recoveryCodes.map((code) => ({
                    agencyId: challenge.agencyId,
                    credentialId: credential.id,
                    codeHash: hashRecoveryCode(code),
                })),
            });
        });
    }
    catch (error) {
        if (!(error instanceof MfaSetupConflict))
            throw error;
        enabled = false;
    }
    if (!enabled) {
        return { error: "MFA setup was already completed or expired" };
    }
    await clearMfaChallengeCookie();
    const trustedDevice = challenge.rememberDevice
        ? await createTrustedDevice(challenge.user)
        : null;
    await createSession(challenge.user.id, {
        persistent: challenge.rememberDevice,
        trustedDeviceId: trustedDevice?.id,
    });
    await logAudit(getTenantDb(challenge.agencyId), challenge.agencyId, {
        actorId: challenge.user.id,
        action: "auth.mfa_setup",
        entityType: "User",
        entityId: challenge.user.id,
        after: {
            recoveryCodeCount: recoveryCodes.length,
            rememberedDevice: !!trustedDevice,
        },
    });
    if (trustedDevice) {
        await logAudit(getTenantDb(challenge.agencyId), challenge.agencyId, {
            actorId: challenge.user.id,
            action: "auth.trusted_device_created",
            entityType: "TrustedDevice",
            entityId: trustedDevice.id,
            after: { label: trustedDevice.label },
        });
    }
    return {
        recoveryCodes,
        continueUrl: await destinationFor(challenge.user),
    };
}
