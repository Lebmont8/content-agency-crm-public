import "server-only";
import crypto from "node:crypto";
import type { TenantDb } from "@/lib/tenant-db";
import { inboundFailure } from "@/inbound/errors";
import { handleInboundEvent } from "@/inbound/handlers";
import type { InboundEventForHandler } from "@/inbound/types";
import { emitNotification } from "@/notifications/service";
const LEASE_MS = 30000;
const RETRY_DELAYS_MS = [5000, 30000, 2 * 60000, 5 * 60000];
export type InboundHandler = (tdb: TenantDb, event: InboundEventForHandler) => Promise<void>;
export async function claimInboundEvent(tdb: TenantDb, eventId: string, now = new Date(), leaseOwner: string = crypto.randomUUID()): Promise<string | null> {
    const claimed = await tdb.inboundEvent.updateMany({
        where: {
            id: eventId,
            status: { in: ["PENDING", "RETRY"] },
            nextAttemptAt: { lte: now },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: {
            status: "PROCESSING",
            leaseOwner,
            leaseUntil: new Date(now.getTime() + LEASE_MS),
        },
    });
    return claimed.count === 1 ? leaseOwner : null;
}
export async function recoverExpiredInboundProcessing(tdb: TenantDb, now = new Date()): Promise<number> {
    const recovered = await tdb.inboundEvent.updateMany({
        where: { status: "PROCESSING", leaseUntil: { lt: now } },
        data: {
            status: "RETRY",
            nextAttemptAt: now,
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: "INBOUND_WORKER_LEASE_EXPIRED",
            lastErrorAt: now,
        },
    });
    return recovered.count;
}
export async function processInboundEvent(tdb: TenantDb, agencyId: string, eventId: string, options: {
    handler?: InboundHandler;
    now?: () => Date;
} = {}): Promise<boolean> {
    const startedAt = options.now?.() ?? new Date();
    const leaseOwner = await claimInboundEvent(tdb, eventId, startedAt);
    if (!leaseOwner)
        return false;
    const event = await tdb.inboundEvent.findUnique({
        where: { id: eventId },
        select: {
            id: true,
            agencyId: true,
            connectionId: true,
            providerEventId: true,
            type: true,
            payload: true,
            occurredAt: true,
            attemptCount: true,
            maxAttempts: true,
        },
    });
    if (!event || event.agencyId !== agencyId)
        return false;
    const attemptNumber = event.attemptCount + 1;
    try {
        await (options.handler ?? handleInboundEvent)(tdb, event);
    }
    catch (error) {
        const finishedAt = options.now?.() ?? new Date();
        const failure = inboundFailure(error);
        const terminal = !failure.retryable || attemptNumber >= event.maxAttempts;
        const retryDelay = RETRY_DELAYS_MS[Math.min(attemptNumber - 1, RETRY_DELAYS_MS.length - 1)]!;
        await tdb.inboundEvent.updateMany({
            where: { id: event.id, status: "PROCESSING", leaseOwner },
            data: {
                status: terminal ? "DLQ" : "RETRY",
                attemptCount: attemptNumber,
                nextAttemptAt: terminal
                    ? finishedAt
                    : new Date(finishedAt.getTime() + retryDelay),
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: failure.code,
                lastErrorAt: finishedAt,
            },
        });
        if (terminal) {
            try {
                const connection = await tdb.platformConnection.findUnique({
                    where: { id: event.connectionId },
                    select: { creatorAccountId: true },
                });
                const aiError = /(?:OPENAI|COPILOT|LLM|AI_)/.test(failure.code);
                await emitNotification(tdb, {
                    agencyId,
                    creatorAccountId: connection?.creatorAccountId,
                    type: aiError ? "AI_ERROR" : "INTEGRATION_ERROR",
                    dedupeKey: `inbound-error:${event.id}:${failure.code}`,
                    title: aiError ? "Ошибка ИИ" : "Ошибка входящего события",
                    body: failure.code,
                    actionPath: "/settings/accounts",
                    severity: "CRITICAL",
                });
            }
            catch {
            }
        }
        return false;
    }
    const finishedAt = options.now?.() ?? new Date();
    const completed = await tdb.inboundEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", leaseOwner },
        data: {
            status: "PROCESSED",
            attemptCount: attemptNumber,
            processedAt: finishedAt,
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: null,
            lastErrorAt: null,
        },
    });
    return completed.count === 1;
}
export async function processDueInboundEvents(tdb: TenantDb, agencyId: string, limit = 25): Promise<number> {
    const now = new Date();
    await recoverExpiredInboundProcessing(tdb, now);
    const due = await tdb.inboundEvent.findMany({
        where: {
            status: { in: ["PENDING", "RETRY"] },
            nextAttemptAt: { lte: now },
        },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        take: limit,
        select: { id: true },
    });
    let processed = 0;
    for (const row of due) {
        if (await processInboundEvent(tdb, agencyId, row.id))
            processed++;
    }
    return processed;
}
