import "server-only";
import crypto from "node:crypto";
import type { InternalNotificationType } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
export const CONFIGURABLE_NOTIFICATION_TYPES = [
    "CUSTOM_CONTENT_REQUEST",
    "NEW_LEAD",
    "LARGE_PURCHASE",
    "INTEGRATION_ERROR",
    "AI_ERROR",
    "BILLING_DUE",
    "AI_SUSPENDED",
] as const satisfies readonly InternalNotificationType[];
export type ConfigurableNotificationType = (typeof CONFIGURABLE_NOTIFICATION_TYPES)[number];
type Route = {
    userId: string;
    inApp: boolean;
    telegram: boolean;
    telegramChatId: string | null;
};
async function routesFor(tdb: TenantDb, input: {
    creatorAccountId?: string | null;
    type: ConfigurableNotificationType;
}): Promise<Route[]> {
    const scopeKeys = input.creatorAccountId
        ? ["*", input.creatorAccountId]
        : ["*"];
    const preferences = await tdb.userNotificationPreference.findMany({
        where: { eventType: input.type, scopeKey: { in: scopeKeys } },
        include: {
            user: {
                select: {
                    id: true,
                    role: true,
                    isActive: true,
                    telegramNotificationChatId: true,
                    telegramNotificationVerifiedAt: true,
                    assignments: input.creatorAccountId
                        ? {
                            where: { creatorAccountId: input.creatorAccountId },
                            select: { id: true },
                        }
                        : false,
                },
            },
        },
    });
    if (preferences.length === 0) {
        const owners = await tdb.user.findMany({
            where: { role: "OWNER", isActive: true },
            select: {
                id: true,
                telegramNotificationChatId: true,
                telegramNotificationVerifiedAt: true,
            },
        });
        return owners.map((owner) => ({
            userId: owner.id,
            inApp: true,
            telegram: false,
            telegramChatId: owner.telegramNotificationVerifiedAt && owner.telegramNotificationChatId
                ? owner.telegramNotificationChatId
                : null,
        }));
    }
    const merged = new Map<string, Route>();
    for (const preference of preferences) {
        const user = preference.user;
        if (!user.isActive)
            continue;
        const assigned = user.role === "OWNER" ||
            !input.creatorAccountId ||
            (Array.isArray(user.assignments) && user.assignments.length > 0);
        if (!assigned)
            continue;
        const current = merged.get(user.id) ?? {
            userId: user.id,
            inApp: false,
            telegram: false,
            telegramChatId: null,
        };
        current.inApp ||= preference.inAppEnabled;
        current.telegram ||=
            preference.telegramEnabled &&
                user.telegramNotificationVerifiedAt !== null &&
                Boolean(user.telegramNotificationChatId);
        current.telegramChatId = current.telegram
            ? user.telegramNotificationChatId
            : current.telegramChatId;
        merged.set(user.id, current);
    }
    return [...merged.values()].filter((route) => route.inApp || route.telegram);
}
function bounded(value: string | null | undefined, max: number): string | null {
    if (!value)
        return null;
    const compact = value.replace(/\s+/g, " ").trim();
    return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}
export async function emitNotification(tdb: TenantDb, input: {
    agencyId: string;
    type: ConfigurableNotificationType;
    dedupeKey: string;
    title: string;
    body?: string | null;
    actionPath?: string | null;
    severity?: "INFO" | "WARNING" | "CRITICAL";
    creatorAccountId?: string | null;
    conversationId?: string | null;
}): Promise<number> {
    const routes = await routesFor(tdb, input);
    let created = 0;
    for (const route of routes) {
        const proposedId = crypto.randomUUID();
        const notification = await tdb.internalNotification.upsert({
            where: {
                agencyId_dedupeKey: {
                    agencyId: input.agencyId,
                    dedupeKey: `${input.dedupeKey}:${route.userId}`,
                },
            },
            create: {
                id: proposedId,
                agencyId: input.agencyId,
                recipientUserId: route.userId,
                creatorAccountId: input.creatorAccountId ?? null,
                conversationId: input.conversationId ?? null,
                type: input.type,
                dedupeKey: `${input.dedupeKey}:${route.userId}`,
                title: bounded(input.title, 160) ?? "Notification",
                body: bounded(input.body, 500),
                actionPath: input.actionPath ?? null,
                severity: input.severity ?? "INFO",
                readAt: route.inApp ? null : new Date(),
            },
            update: {},
        });
        if (notification.id === proposedId)
            created += 1;
        if (route.telegram && route.telegramChatId) {
            await tdb.notificationDelivery.upsert({
                where: {
                    notificationId_channel: {
                        notificationId: notification.id,
                        channel: "TELEGRAM",
                    },
                },
                create: {
                    agencyId: input.agencyId,
                    notificationId: notification.id,
                    channel: "TELEGRAM",
                    destination: route.telegramChatId,
                },
                update: {},
            });
        }
    }
    return created;
}
