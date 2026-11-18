import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/auth-token";
import { requiresMfa } from "@/auth/mfa";
import { revokeAllTrustedDevices, revokeCurrentTrustedDevice } from "@/auth/trusted-device";
const SESSION_TTL_HOURS = 12;
const PERSISTENT_SESSION_TTL_DAYS = 30;
export function cookieName(): string {
    return process.env.SESSION_COOKIE_NAME || "crm_session";
}
export type AuthContext = {
    user: {
        id: string;
        email: string;
        name: string;
        role: Role;
        agencyId: string;
        isPlatformAdmin: boolean;
    };
    agency: {
        id: string;
        name: string;
        slug: string;
        suspended: boolean;
        dueDate: Date | null;
        paymentPending: boolean;
    };
};
export async function createSession(userId: string, options: {
    persistent?: boolean;
    trustedDeviceId?: string;
} = {}): Promise<void> {
    const token = createOpaqueToken();
    const ttlMs = options.persistent
        ? PERSISTENT_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
        : SESSION_TTL_HOURS * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    await db.session.create({
        data: {
            tokenHash: hashOpaqueToken(token),
            userId,
            trustedDeviceId: options.trustedDeviceId,
            expiresAt,
        },
    });
    const jar = await cookies();
    jar.set(cookieName(), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        ...(options.persistent ? { expires: expiresAt } : {}),
        path: "/",
        priority: "high",
    });
}
export async function destroySession(): Promise<void> {
    const jar = await cookies();
    const token = jar.get(cookieName())?.value;
    if (token) {
        await db.session.deleteMany({
            where: { tokenHash: hashOpaqueToken(token) },
        });
    }
    await revokeCurrentTrustedDevice();
    jar.delete(cookieName());
}
export const getAuth = cache(async (): Promise<AuthContext | null> => {
    const jar = await cookies();
    const token = jar.get(cookieName())?.value;
    if (!token)
        return null;
    const session = await db.session.findUnique({
        where: { tokenHash: hashOpaqueToken(token) },
        include: { user: { include: { agency: true, mfaCredential: true } } },
    });
    const missingRequiredMfa = !!session &&
        requiresMfa(session.user) &&
        !session.user.mfaCredential?.enabledAt;
    if (!session ||
        session.expiresAt < new Date() ||
        !session.user.isActive ||
        missingRequiredMfa) {
        if (session) {
            await db.session.deleteMany({ where: { id: session.id } });
        }
        return null;
    }
    const { user } = session;
    return {
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            agencyId: user.agencyId,
            isPlatformAdmin: user.isPlatformAdmin,
        },
        agency: {
            id: user.agency.id,
            name: user.agency.name,
            slug: user.agency.slug,
            suspended: user.agency.status === "SUSPENDED",
            dueDate: user.agency.dueDate,
            paymentPending: user.agency.paymentPending,
        },
    };
});
export async function requireAuth(): Promise<AuthContext> {
    const auth = await getAuth();
    if (!auth)
        redirect("/login");
    return auth;
}
export async function revokeUserSessions(userId: string): Promise<void> {
    const user = await db.user.findUnique({ where: { id: userId } });
    await db.session.deleteMany({ where: { userId } });
    if (user)
        await revokeAllTrustedDevices(user.agencyId, user.id);
}
export async function requireRole(...roles: Role[]): Promise<AuthContext> {
    const auth = await requireAuth();
    if (!roles.includes(auth.user.role))
        redirect("/inbox");
    return auth;
}
