import "server-only";
import crypto from "node:crypto";
import type { TenantDb } from "@/lib/tenant-db";
const LEASE_MS = 30000;
const MAX_ATTEMPTS = 5;
const RETRY_MS = [10000, 60000, 5 * 60000, 15 * 60000];
export async function processNotificationDelivery(tdb: TenantDb, agencyId: string, deliveryId: string, options: {
    fetchImpl?: typeof fetch;
    env?: Readonly<Record<string, string | undefined>>;
    now?: () => Date;
} = {}): Promise<boolean> {
    const now = options.now?.() ?? new Date();
    const leaseOwner = crypto.randomUUID();
    const claimed = await tdb.notificationDelivery.updateMany({
        where: {
            id: deliveryId,
            status: { in: ["PENDING", "RETRY"] },
            nextAttemptAt: { lte: now },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: { status: "PROCESSING", leaseOwner, leaseUntil: new Date(now.getTime() + LEASE_MS) },
    });
    if (claimed.count !== 1)
        return false;
    const delivery = await tdb.notificationDelivery.findUnique({
        where: { id: deliveryId },
        include: { notification: true },
    });
    if (!delivery || delivery.agencyId !== agencyId)
        return false;
    const env = options.env ?? process.env;
    const token = env.NOTIFICATION_TELEGRAM_BOT_TOKEN?.trim();
    if (delivery.channel !== "TELEGRAM" || !token) {
        await tdb.notificationDelivery.updateMany({
            where: { id: delivery.id, status: "PROCESSING", leaseOwner },
            data: {
                status: "FAILED",
                attemptCount: { increment: 1 },
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: token ? "CHANNEL_UNSUPPORTED" : "TELEGRAM_BOT_NOT_CONFIGURED",
            },
        });
        return false;
    }
    const publicUrl = env.PUBLIC_APP_URL?.replace(/\/$/, "");
    const link = publicUrl && delivery.notification.actionPath
        ? `\n${publicUrl}${delivery.notification.actionPath}`
        : "";
    const body = [delivery.notification.title, delivery.notification.body]
        .filter(Boolean)
        .join("\n");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let ok = false;
    let retryable = true;
    let errorCode = "TELEGRAM_DELIVERY_FAILED";
    try {
        const response = await (options.fetchImpl ?? fetch)(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            signal: controller.signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                chat_id: delivery.destination,
                text: `${body}${link}`.slice(0, 4000),
                disable_web_page_preview: true,
            }),
        });
        ok = response.ok;
        retryable = response.status === 429 || response.status >= 500;
        errorCode = response.status === 429 ? "TELEGRAM_RATE_LIMITED" : `TELEGRAM_HTTP_${response.status}`;
    }
    catch (error) {
        errorCode = error instanceof Error && error.name === "AbortError"
            ? "TELEGRAM_TIMEOUT"
            : "TELEGRAM_REQUEST_FAILED";
    }
    finally {
        clearTimeout(timeout);
    }
    if (ok) {
        await tdb.notificationDelivery.updateMany({
            where: { id: delivery.id, status: "PROCESSING", leaseOwner },
            data: {
                status: "SENT",
                attemptCount: { increment: 1 },
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: null,
                sentAt: options.now?.() ?? new Date(),
            },
        });
        return true;
    }
    const nextAttempt = delivery.attemptCount + 1;
    const terminal = !retryable || nextAttempt >= MAX_ATTEMPTS;
    await tdb.notificationDelivery.updateMany({
        where: { id: delivery.id, status: "PROCESSING", leaseOwner },
        data: {
            status: terminal ? "FAILED" : "RETRY",
            attemptCount: { increment: 1 },
            nextAttemptAt: terminal
                ? now
                : new Date(now.getTime() + RETRY_MS[Math.min(nextAttempt - 1, RETRY_MS.length - 1)]!),
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: errorCode,
        },
    });
    return false;
}
export async function processDueNotificationDeliveries(tdb: TenantDb, agencyId: string, limit = 25): Promise<number> {
    const due = await tdb.notificationDelivery.findMany({
        where: { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: new Date() } },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        take: limit,
        select: { id: true },
    });
    let sent = 0;
    for (const row of due) {
        if (await processNotificationDelivery(tdb, agencyId, row.id))
            sent += 1;
    }
    return sent;
}
