import "server-only";
import { cookies } from "next/headers";
import type { MfaChallengePurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/auth-token";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MFA_CHALLENGE_COOKIE = "crm_mfa_challenge";
type ChallengeUser = {
    id: string;
    agencyId: string;
};
export async function startMfaChallenge(user: ChallengeUser, purpose: MfaChallengePurpose, options: {
    rememberDevice?: boolean;
} = {}): Promise<void> {
    const now = new Date();
    await db.mfaChallenge.deleteMany({
        where: { userId: user.id, consumedAt: null },
    });
    const token = createOpaqueToken();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
    await db.mfaChallenge.create({
        data: {
            agencyId: user.agencyId,
            userId: user.id,
            tokenHash: hashOpaqueToken(token),
            purpose,
            rememberDevice: options.rememberDevice ?? false,
            expiresAt,
        },
    });
    const jar = await cookies();
    jar.set(MFA_CHALLENGE_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        expires: expiresAt,
        path: "/",
        priority: "high",
    });
}
export async function getMfaChallenge() {
    const jar = await cookies();
    const token = jar.get(MFA_CHALLENGE_COOKIE)?.value;
    if (!token)
        return null;
    const challenge = await db.mfaChallenge.findUnique({
        where: { tokenHash: hashOpaqueToken(token) },
        include: { user: { include: { mfaCredential: true } } },
    });
    const invalid = !challenge ||
        !!challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attemptCount >= challenge.maxAttempts ||
        !challenge.user.isActive;
    return invalid ? null : challenge;
}
export async function recordMfaFailure(challengeId: string): Promise<void> {
    const now = new Date();
    await db.mfaChallenge.updateMany({
        where: {
            id: challengeId,
            consumedAt: null,
            expiresAt: { gt: now },
            attemptCount: { lt: 5 },
        },
        data: { attemptCount: { increment: 1 } },
    });
    await db.mfaChallenge.updateMany({
        where: { id: challengeId, consumedAt: null, attemptCount: { gte: 5 } },
        data: { consumedAt: now },
    });
}
export async function consumeMfaChallenge(challengeId: string): Promise<boolean> {
    const now = new Date();
    const consumed = await db.mfaChallenge.updateMany({
        where: {
            id: challengeId,
            consumedAt: null,
            expiresAt: { gt: now },
            attemptCount: { lt: 5 },
        },
        data: { consumedAt: now },
    });
    return consumed.count === 1;
}
export async function clearMfaChallengeCookie(): Promise<void> {
    const jar = await cookies();
    jar.delete(MFA_CHALLENGE_COOKIE);
}
