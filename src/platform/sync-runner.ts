import "server-only";
import crypto from "node:crypto";
import type { TenantDb } from "@/lib/tenant-db";
import { FanvueApiError } from "@/platform/fanvue/client";
import { FanvueOAuthError, FanvueScopeError } from "@/platform/fanvue/oauth";
import { PilotGateDeniedError } from "@/pilot/policy";
import { PlatformSyncPaginationError, syncAccountData, type AccountRow, type SyncResult } from "@/platform/sync";
import { emitNotification } from "@/notifications/service";
const SYNC_LEASE_MS = 15 * 60 * 1000;
export class PlatformSyncBusyError extends Error {
    readonly code = "PLATFORM_SYNC_ALREADY_RUNNING";
    constructor() {
        super("Platform sync is already running");
        this.name = "PlatformSyncBusyError";
    }
}
export class PlatformSyncLeaseLostError extends Error {
    readonly code = "PLATFORM_SYNC_LEASE_LOST";
    constructor() {
        super("Platform sync lease was lost before completion");
        this.name = "PlatformSyncLeaseLostError";
    }
}
export function platformSyncFailureCode(error: unknown): string {
    if (error instanceof PlatformSyncBusyError)
        return error.code;
    if (error instanceof PlatformSyncLeaseLostError)
        return error.code;
    if (error instanceof PlatformSyncPaginationError)
        return error.code;
    if (error instanceof PilotGateDeniedError)
        return error.code;
    if (error instanceof FanvueScopeError)
        return error.code;
    if (error instanceof FanvueOAuthError) {
        if ([400, 401].includes(error.status))
            return "FANVUE_SYNC_AUTH_REJECTED";
        if (error.status === 429)
            return "FANVUE_SYNC_RATE_LIMITED";
        if (error.status >= 500)
            return "FANVUE_SYNC_PROVIDER_UNAVAILABLE";
        return "FANVUE_SYNC_TOKEN_FAILED";
    }
    if (error instanceof FanvueApiError) {
        if (error.status === 401)
            return "FANVUE_SYNC_AUTH_REJECTED";
        if (error.status === 403)
            return "FANVUE_SYNC_SCOPE_REJECTED";
        if (error.status === 429)
            return "FANVUE_SYNC_RATE_LIMITED";
        if (error.status >= 500)
            return "FANVUE_SYNC_PROVIDER_UNAVAILABLE";
        return "FANVUE_SYNC_API_FAILED";
    }
    return "PLATFORM_SYNC_FAILED";
}
export async function claimPlatformSync(tdb: TenantDb, connectionId: string, now = new Date(), leaseOwner: string = crypto.randomUUID()): Promise<string | null> {
    const claimed = await tdb.platformConnection.updateMany({
        where: {
            id: connectionId,
            OR: [
                { status: "ACTIVE", syncLeaseUntil: null },
                { status: "ACTIVE", syncLeaseUntil: { lt: now } },
                { status: "SYNCING", syncLeaseUntil: null },
                { status: "SYNCING", syncLeaseUntil: { lt: now } },
            ],
        },
        data: {
            status: "SYNCING",
            lastSyncStartedAt: now,
            syncLeaseOwner: leaseOwner,
            syncLeaseUntil: new Date(now.getTime() + SYNC_LEASE_MS),
            lastErrorCode: null,
        },
    });
    return claimed.count === 1 ? leaseOwner : null;
}
export async function runAccountSync(tdb: TenantDb, agencyId: string, account: AccountRow, options: {
    now?: () => Date;
    sync?: typeof syncAccountData;
} = {}): Promise<SyncResult> {
    if (!account.connection)
        throw new Error("Platform connection is missing");
    const startedAt = options.now?.() ?? new Date();
    const leaseOwner = await claimPlatformSync(tdb, account.connection.id, startedAt);
    if (!leaseOwner)
        throw new PlatformSyncBusyError();
    try {
        const result = await (options.sync ?? syncAccountData)(tdb, agencyId, account);
        const finishedAt = options.now?.() ?? new Date();
        const completed = await tdb.platformConnection.updateMany({
            where: {
                id: account.connection.id,
                status: "SYNCING",
                syncLeaseOwner: leaseOwner,
            },
            data: {
                status: "ACTIVE",
                lastVerifiedAt: finishedAt,
                lastSyncedAt: finishedAt,
                syncLeaseOwner: null,
                syncLeaseUntil: null,
                lastErrorCode: null,
            },
        });
        if (completed.count !== 1)
            throw new PlatformSyncLeaseLostError();
        return result;
    }
    catch (error) {
        const code = platformSyncFailureCode(error);
        const reauthRequired = code === "FANVUE_SCOPE_MISMATCH" ||
            code === "FANVUE_SYNC_AUTH_REJECTED";
        await tdb.platformConnection.updateMany({
            where: {
                id: account.connection.id,
                status: "SYNCING",
                syncLeaseOwner: leaseOwner,
            },
            data: {
                status: reauthRequired ? "REAUTH_REQUIRED" : "ACTIVE",
                syncLeaseOwner: null,
                syncLeaseUntil: null,
                lastErrorCode: code,
            },
        });
        await tdb.platformConnection.updateMany({
            where: { id: account.connection.id, syncLeaseOwner: leaseOwner },
            data: { syncLeaseOwner: null, syncLeaseUntil: null },
        });
        try {
            await emitNotification(tdb, {
                agencyId,
                creatorAccountId: account.id,
                type: "INTEGRATION_ERROR",
                dedupeKey: `sync-error:${account.connection.id}:${code}:${new Date().toISOString().slice(0, 10)}`,
                title: "Ошибка синхронизации платформы",
                body: code,
                actionPath: "/settings/accounts",
                severity: "CRITICAL",
            });
        }
        catch {
        }
        throw error;
    }
}
