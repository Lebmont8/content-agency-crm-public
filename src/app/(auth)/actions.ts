"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getTenantDb } from "@/lib/tenant-db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";
import { hashOpaqueToken } from "@/lib/auth-token";
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from "@/lib/login-throttle";
import { logAudit } from "@/domain/audit";
import { ensurePendingMfaCredential, shouldChallengeMfa } from "@/auth/mfa";
import { startMfaChallenge } from "@/auth/mfa-challenge";
import { createTrustedDevice, rotateTrustedDevice } from "@/auth/trusted-device";
import { isPublicRegistrationEnabled } from "@/lib/public-registration";
export type ActionState = {
    error?: string;
    inviteUrl?: string;
} | null;
function slugify(name: string): string {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
    return `${base || "agency"}-${Math.random().toString(36).slice(2, 8)}`;
}
const registerSchema = z.object({
    agencyName: z.string().min(2).max(80),
    name: z.string().min(2).max(80),
    email: z.string().email().toLowerCase(),
    password: z.string().min(8).max(200),
});
export async function register(_prev: ActionState, formData: FormData): Promise<ActionState> {
    if (!isPublicRegistrationEnabled()) {
        return { error: "Public registration is closed. Use an invitation link." };
    }
    const parsed = registerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { agencyName, name, email, password } = parsed.data;
    const existing = await db.user.findUnique({ where: { email } });
    if (existing)
        return { error: "An account with this email already exists" };
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const user = await db.user.create({
        data: {
            email,
            name,
            role: "OWNER",
            passwordHash: await hashPassword(password),
            agency: {
                create: {
                    name: agencyName,
                    slug: slugify(agencyName),
                    saasSubscription: {
                        create: {
                            status: "TRIALING",
                            currentPeriodStart: now,
                            currentPeriodEnd: trialEnd,
                        },
                    },
                },
            },
        },
    });
    const tdb = getTenantDb(user.agencyId);
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "auth.register",
        entityType: "Agency",
        entityId: user.agencyId,
        after: { agencyName, ownerEmail: email },
    });
    await createSession(user.id);
    redirect("/onboarding");
}
const loginSchema = z.object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(1),
    rememberDevice: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
});
const INVALID_LOGIN = "Invalid email or password";
const DUMMY_PASSWORD_HASH = "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.";
export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const parsed = loginSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: INVALID_LOGIN };
    const { email, password, rememberDevice } = parsed.data;
    const blocked = await isLoginBlocked(email);
    const user = await db.user.findUnique({
        where: { email },
        include: { mfaCredential: true },
    });
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (blocked || !user || !user.isActive || !ok) {
        if (!blocked) {
            const throttle = await recordLoginFailure(email);
            if (throttle.newlyBlocked && user) {
                await logAudit(getTenantDb(user.agencyId), user.agencyId, {
                    actorId: null,
                    action: "auth.login_blocked",
                    entityType: "User",
                    entityId: user.id,
                    after: { reason: "attempt_limit" },
                });
            }
        }
        return { error: INVALID_LOGIN };
    }
    await clearLoginFailures(email);
    if (shouldChallengeMfa(user)) {
        const credential = await ensurePendingMfaCredential(user);
        const purpose = credential.enabledAt ? "LOGIN" : "SETUP";
        await startMfaChallenge(user, purpose, { rememberDevice });
        redirect(purpose === "LOGIN" ? "/mfa" : "/mfa/setup");
    }
    const trustedDevice = rememberDevice
        ? await createTrustedDevice(user)
        : null;
    await createSession(user.id, {
        persistent: rememberDevice,
        trustedDeviceId: trustedDevice?.id,
    });
    const tdb = getTenantDb(user.agencyId);
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "auth.login",
        entityType: "User",
        entityId: user.id,
        after: { rememberedDevice: !!trustedDevice },
    });
    if (trustedDevice) {
        await logAudit(tdb, user.agencyId, {
            actorId: user.id,
            action: "auth.trusted_device_created",
            entityType: "TrustedDevice",
            entityId: trustedDevice.id,
            after: { label: trustedDevice.label },
        });
    }
    let dest = "/inbox";
    if (user.isPlatformAdmin) {
        dest = "/admin";
    }
    else if (user.role !== "CHATTER") {
        const accounts = await tdb.creatorAccount.count();
        if (accounts === 0)
            dest = "/onboarding";
    }
    redirect(dest);
}
export async function restoreTrustedLogin(): Promise<void> {
    const restored = await rotateTrustedDevice();
    if (!restored)
        return;
    await createSession(restored.user.id, {
        persistent: true,
        trustedDeviceId: restored.deviceId,
    });
    const tdb = getTenantDb(restored.user.agencyId);
    await logAudit(tdb, restored.user.agencyId, {
        actorId: restored.user.id,
        action: "auth.trusted_device_used",
        entityType: "TrustedDevice",
        entityId: restored.deviceId,
    });
    let dest = "/inbox";
    if (restored.user.isPlatformAdmin) {
        dest = "/admin";
    }
    else if (restored.user.role !== "CHATTER") {
        const accounts = await tdb.creatorAccount.count();
        if (accounts === 0)
            dest = "/onboarding";
    }
    redirect(dest);
}
export async function logout(): Promise<void> {
    await destroySession();
    redirect("/login");
}
const acceptInviteSchema = z.object({
    token: z.string().min(10),
    name: z.string().min(2).max(80),
    password: z.string().min(8).max(200),
});
export async function acceptInvite(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const parsed = acceptInviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { token, name, password } = parsed.data;
    const invite = await db.invitation.findUnique({
        where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        return { error: "This invitation is invalid or has expired" };
    }
    const existing = await db.user.findUnique({ where: { email: invite.email } });
    if (existing)
        return { error: "An account with this email already exists" };
    const user = await db.user.create({
        data: {
            agencyId: invite.agencyId,
            email: invite.email,
            name,
            role: invite.role,
            passwordHash: await hashPassword(password),
        },
    });
    await db.invitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
    });
    await createSession(user.id);
    await logAudit(getTenantDb(user.agencyId), user.agencyId, {
        actorId: user.id,
        action: "auth.login",
        entityType: "User",
        entityId: user.id,
        after: { via: "invitation", role: invite.role },
    });
    redirect("/inbox");
}
