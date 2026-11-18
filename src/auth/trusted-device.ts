import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/auth-token";
import { requiresMfa } from "@/auth/mfa";
export const TRUSTED_DEVICE_IDLE_DAYS = 90;
const TRUSTED_DEVICE_COOKIE = "crm_trusted_device";
type TrustedDeviceUser = {
    id: string;
    agencyId: string;
};
export function trustedDeviceExpiresAt(now: Date): Date {
    return new Date(now.getTime() + TRUSTED_DEVICE_IDLE_DAYS * 24 * 60 * 60 * 1000);
}
export function describeUserAgent(userAgent: string | null): string {
    if (!userAgent)
        return "Browser";
    const browser = userAgent.includes("Edg/")
        ? "Edge"
        : userAgent.includes("Firefox/")
            ? "Firefox"
            : userAgent.includes("Chrome/")
                ? "Chrome"
                : userAgent.includes("Safari/")
                    ? "Safari"
                    : "Browser";
    const os = userAgent.includes("Android")
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
            ? "iOS"
            : userAgent.includes("Windows")
                ? "Windows"
                : userAgent.includes("Mac OS")
                    ? "macOS"
                    : userAgent.includes("Linux")
                        ? "Linux"
                        : null;
    return os ? `${browser} on ${os}` : browser;
}
async function setTrustedDeviceCookie(token: string, expiresAt: Date) {
    const jar = await cookies();
    jar.set(TRUSTED_DEVICE_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        expires: expiresAt,
        path: "/",
        priority: "high",
    });
}
export async function clearTrustedDeviceCookie(): Promise<void> {
    const jar = await cookies();
    jar.delete(TRUSTED_DEVICE_COOKIE);
}
export async function createTrustedDevice(user: TrustedDeviceUser) {
    const now = new Date();
    const expiresAt = trustedDeviceExpiresAt(now);
    const token = createOpaqueToken();
    const jar = await cookies();
    const previousToken = jar.get(TRUSTED_DEVICE_COOKIE)?.value;
    if (previousToken) {
        const previous = await db.trustedDevice.findUnique({
            where: { tokenHash: hashOpaqueToken(previousToken) },
            select: { id: true, userId: true, revokedAt: true },
        });
        if (previous?.userId === user.id && !previous.revokedAt) {
            await db.trustedDevice.updateMany({
                where: { id: previous.id, userId: user.id, revokedAt: null },
                data: { revokedAt: now },
            });
            await db.session.deleteMany({
                where: { trustedDeviceId: previous.id },
            });
        }
    }
    const requestHeaders = await headers();
    const device = await db.trustedDevice.create({
        data: {
            agencyId: user.agencyId,
            userId: user.id,
            tokenHash: hashOpaqueToken(token),
            label: describeUserAgent(requestHeaders.get("user-agent")),
            expiresAt,
            lastUsedAt: now,
        },
    });
    await setTrustedDeviceCookie(token, expiresAt);
    return device;
}
export async function rotateTrustedDevice() {
    const jar = await cookies();
    const token = jar.get(TRUSTED_DEVICE_COOKIE)?.value;
    if (!token)
        return null;
    const tokenHash = hashOpaqueToken(token);
    const now = new Date();
    const device = await db.trustedDevice.findUnique({
        where: { tokenHash },
        include: {
            user: { include: { agency: true, mfaCredential: true } },
        },
    });
    const invalid = !device ||
        !!device.revokedAt ||
        device.expiresAt <= now ||
        !device.user.isActive ||
        (requiresMfa(device.user) && !device.user.mfaCredential?.enabledAt);
    if (invalid) {
        await clearTrustedDeviceCookie();
        return null;
    }
    const replacement = createOpaqueToken();
    const expiresAt = trustedDeviceExpiresAt(now);
    const rotated = await db.trustedDevice.updateMany({
        where: {
            id: device.id,
            tokenHash,
            revokedAt: null,
            expiresAt: { gt: now },
        },
        data: {
            tokenHash: hashOpaqueToken(replacement),
            expiresAt,
            lastUsedAt: now,
        },
    });
    if (rotated.count !== 1)
        return null;
    await setTrustedDeviceCookie(replacement, expiresAt);
    return { deviceId: device.id, user: device.user };
}
export async function currentTrustedDeviceId(userId: string): Promise<string | null> {
    const jar = await cookies();
    const token = jar.get(TRUSTED_DEVICE_COOKIE)?.value;
    if (!token)
        return null;
    const device = await db.trustedDevice.findUnique({
        where: { tokenHash: hashOpaqueToken(token) },
        select: { id: true, userId: true, revokedAt: true },
    });
    return device?.userId === userId && !device.revokedAt ? device.id : null;
}
export async function revokeCurrentTrustedDevice(userId?: string): Promise<void> {
    const jar = await cookies();
    const token = jar.get(TRUSTED_DEVICE_COOKIE)?.value;
    if (token) {
        const device = await db.trustedDevice.findUnique({
            where: { tokenHash: hashOpaqueToken(token) },
            select: { id: true, userId: true, revokedAt: true },
        });
        if (device && (!userId || device.userId === userId) && !device.revokedAt) {
            await db.trustedDevice.updateMany({
                where: { id: device.id, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            await db.session.deleteMany({
                where: { trustedDeviceId: device.id },
            });
        }
    }
    jar.delete(TRUSTED_DEVICE_COOKIE);
}
export async function revokeTrustedDevice(agencyId: string, userId: string, deviceId: string): Promise<{
    revoked: boolean;
    current: boolean;
}> {
    const currentId = await currentTrustedDeviceId(userId);
    const revoked = await db.trustedDevice.updateMany({
        where: {
            id: deviceId,
            agencyId,
            userId,
            revokedAt: null,
        },
        data: { revokedAt: new Date() },
    });
    if (currentId === deviceId)
        await clearTrustedDeviceCookie();
    if (revoked.count === 1) {
        await db.session.deleteMany({ where: { trustedDeviceId: deviceId } });
    }
    return { revoked: revoked.count === 1, current: currentId === deviceId };
}
export async function revokeAllTrustedDevices(agencyId: string, userId: string): Promise<number> {
    const currentId = await currentTrustedDeviceId(userId);
    const revoked = await db.trustedDevice.updateMany({
        where: { agencyId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    await db.session.deleteMany({ where: { userId, trustedDeviceId: { not: null } } });
    if (currentId)
        await clearTrustedDeviceCookie();
    return revoked.count;
}
