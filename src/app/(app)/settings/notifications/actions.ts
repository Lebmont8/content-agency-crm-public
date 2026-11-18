"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { hashOpaqueToken } from "@/lib/auth-token";
import { logAudit } from "@/domain/audit";
import { CONFIGURABLE_NOTIFICATION_TYPES } from "@/notifications/service";
import type { ActionState } from "@/app/(auth)/actions";
const preferenceSchema = z.object({
    userId: z.string().min(1),
    accountId: z.string().min(1),
    eventType: z.enum(CONFIGURABLE_NOTIFICATION_TYPES),
    inAppEnabled: z.preprocess((value) => value === "on" || value === true, z.boolean()),
    telegramEnabled: z.preprocess((value) => value === "on" || value === true, z.boolean()),
});
export async function saveNotificationPreference(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user } = await requireAuth();
    if (user.role !== "OWNER")
        return { error: "Only the owner can change routing" };
    const parsed = preferenceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: "Choose an event, recipient and channel" };
    if (!parsed.data.inAppEnabled && !parsed.data.telegramEnabled) {
        return { error: "Enable at least one notification channel" };
    }
    const tdb = getTenantDb(user.agencyId);
    const target = await tdb.user.findUnique({
        where: { id: parsed.data.userId },
        select: { id: true, role: true, isActive: true },
    });
    if (!target?.isActive)
        return { error: "Recipient not found" };
    const creatorAccountId = parsed.data.accountId === "*" ? null : parsed.data.accountId;
    if (creatorAccountId) {
        const account = await tdb.creatorAccount.findUnique({
            where: { id: creatorAccountId },
            select: { id: true },
        });
        if (!account)
            return { error: "Creator account not found" };
        if (target.role !== "OWNER") {
            const assignment = await tdb.chatterAssignment.findFirst({
                where: { userId: target.id, creatorAccountId },
                select: { id: true },
            });
            if (!assignment)
                return { error: "Assign this employee to the creator first" };
        }
    }
    const scopeKey = creatorAccountId ?? "*";
    const preference = await tdb.userNotificationPreference.upsert({
        where: {
            agencyId_userId_scopeKey_eventType: {
                agencyId: user.agencyId,
                userId: target.id,
                scopeKey,
                eventType: parsed.data.eventType,
            },
        },
        create: {
            agencyId: user.agencyId,
            userId: target.id,
            creatorAccountId,
            scopeKey,
            eventType: parsed.data.eventType,
            inAppEnabled: parsed.data.inAppEnabled,
            telegramEnabled: parsed.data.telegramEnabled,
        },
        update: {
            creatorAccountId,
            inAppEnabled: parsed.data.inAppEnabled,
            telegramEnabled: parsed.data.telegramEnabled,
        },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "notification.preference.update",
        entityType: "UserNotificationPreference",
        entityId: preference.id,
        after: {
            recipientUserId: target.id,
            creatorAccountId,
            eventType: parsed.data.eventType,
            inAppEnabled: parsed.data.inAppEnabled,
            telegramEnabled: parsed.data.telegramEnabled,
        },
    });
    revalidatePath("/settings/notifications");
    return null;
}
export async function deleteNotificationPreference(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    if (user.role !== "OWNER")
        return;
    const id = z.string().min(1).parse(formData.get("preferenceId"));
    const tdb = getTenantDb(user.agencyId);
    const before = await tdb.userNotificationPreference.findUnique({ where: { id } });
    if (!before)
        return;
    await tdb.userNotificationPreference.delete({ where: { id } });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "notification.preference.delete",
        entityType: "UserNotificationPreference",
        entityId: id,
        before: { eventType: before.eventType, scopeKey: before.scopeKey, userId: before.userId },
    });
    revalidatePath("/settings/notifications");
}
export type TelegramPairingState = {
    error?: string;
    code?: string;
} | null;
export async function createTelegramPairing(_prev: TelegramPairingState, _formData: FormData): Promise<TelegramPairingState> {
    const { user } = await requireAuth();
    if (!process.env.NOTIFICATION_TELEGRAM_BOT_USERNAME) {
        return { error: "Telegram notification bot is not configured" };
    }
    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    const tdb = getTenantDb(user.agencyId);
    await tdb.user.update({
        where: { id: user.id },
        data: {
            telegramNotificationPairingHash: hashOpaqueToken(code),
            telegramNotificationPairingExpiry: new Date(Date.now() + 15 * 60000),
        },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "notification.telegram.pairing",
        entityType: "User",
        entityId: user.id,
        after: { pairingExpiresInMinutes: 15, codeLength: code.length },
    });
    return { code };
}
export async function disconnectTelegramNotifications(): Promise<void> {
    const { user } = await requireAuth();
    const tdb = getTenantDb(user.agencyId);
    await tdb.user.update({
        where: { id: user.id },
        data: {
            telegramNotificationChatId: null,
            telegramNotificationVerifiedAt: null,
            telegramNotificationPairingHash: null,
            telegramNotificationPairingExpiry: null,
        },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "notification.telegram.disconnect",
        entityType: "User",
        entityId: user.id,
    });
    revalidatePath("/settings/notifications");
}
