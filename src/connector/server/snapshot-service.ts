import "server-only";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import { logAudit } from "@/domain/audit";
import { DESKTOP_CONNECTOR_COMMAND_LEASE_MS } from "@/connector/protocol";
import { desktopConnectorSnapshotDigestFromPageDigests, desktopConnectorSnapshotPageDigest, type DesktopConnectorSnapshotPage } from "@/connector/snapshot";
import { DesktopConnectorError } from "@/connector/server/errors";
import { assertPilotGate, PilotGateDeniedError } from "@/pilot/policy";
import { isLivePilotRuntimeReady } from "@/pilot/runtime";
type SnapshotIngestionResult = {
    resource: DesktopConnectorSnapshotPage["resource"];
    itemCount: number;
};
type SnapshotIngestionOptions = {
    now?: Date;
    runtimeReady?: boolean;
};
type SnapshotAuditReceipt = {
    resource: Exclude<DesktopConnectorSnapshotPage["resource"], "MANIFEST">;
    pageIndex: number;
    itemCount: number;
    pageDigest: string;
};
function snapshotAuditReceipt(value: Prisma.JsonValue | null): SnapshotAuditReceipt | null {
    if (!value || Array.isArray(value) || typeof value !== "object")
        return null;
    const resource = value.resource;
    const pageIndex = value.pageIndex;
    const itemCount = value.itemCount;
    const pageDigest = value.pageDigest;
    if (!["IDENTITY", "FANS", "MESSAGES", "TRANSACTIONS", "VAULT"].includes(String(resource)) ||
        !Number.isInteger(pageIndex) ||
        !Number.isInteger(itemCount) ||
        typeof pageDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(pageDigest)) {
        return null;
    }
    return {
        resource: resource as SnapshotAuditReceipt["resource"],
        pageIndex: pageIndex as number,
        itemCount: itemCount as number,
        pageDigest,
    };
}
function assertUniqueReferences(references: string[], resource: DesktopConnectorSnapshotPage["resource"]): void {
    if (new Set(references).size !== references.length) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_DUPLICATE_REFERENCE", 400, `Desktop connector ${resource} page contains duplicate references`);
    }
}
function assertCapturedAt(page: DesktopConnectorSnapshotPage, now: Date): void {
    const capturedAt = new Date(page.capturedAt);
    if (capturedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_TIME_INVALID", 400, "Desktop connector snapshot time is in the future");
    }
}
function mapIngestionError(error: unknown): never {
    if (error instanceof DesktopConnectorError)
        throw error;
    if (error instanceof PilotGateDeniedError) {
        throw new DesktopConnectorError(error.code, 403, error.message);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002") {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_REFERENCE_CONFLICT", 409, "Desktop connector snapshot conflicts with an existing reference");
    }
    throw error;
}
export async function ingestDesktopConnectorSnapshotPage(tdb: TenantDb, input: {
    agencyId: string;
    deviceId: string;
    page: DesktopConnectorSnapshotPage;
}, options: SnapshotIngestionOptions = {}): Promise<SnapshotIngestionResult> {
    const now = options.now ?? new Date();
    try {
        assertCapturedAt(input.page, now);
        const command = await tdb.desktopConnectorCommand.findUnique({
            where: { id: input.page.commandId },
            select: {
                id: true,
                deviceId: true,
                kind: true,
                status: true,
                leaseOwner: true,
                profile: {
                    select: {
                        id: true,
                        platform: true,
                        creatorAccountId: true,
                        connectionId: true,
                        connection: {
                            select: {
                                remoteAccountId: true,
                                lastVerifiedAt: true,
                                status: true,
                            },
                        },
                        creatorAccount: {
                            select: {
                                id: true,
                                platform: true,
                                status: true,
                                activated: true,
                                aiAutoReply: true,
                                pilotMode: true,
                                complianceApprovedAt: true,
                                dailyAiRunLimit: true,
                                dailyAiCostLimitMicros: true,
                                agency: {
                                    select: { status: true, pilotEnabled: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!command ||
            command.deviceId !== input.deviceId ||
            command.status !== "LEASED" ||
            command.leaseOwner !== input.page.deliveryId) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_LEASE_INVALID", 409, "Desktop connector snapshot command lease is stale");
        }
        if (command.profile.platform !== "fansly" ||
            command.profile.creatorAccount.platform !== "fansly") {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_PLATFORM_INVALID", 409, "Desktop connector snapshot is not a Fansly profile");
        }
        if (input.page.resource === "IDENTITY"
            ? !["VERIFY_PROFILE", "SYNC_SNAPSHOT"].includes(command.kind)
            : command.kind !== "SYNC_SNAPSHOT") {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_COMMAND_INVALID", 409, "Desktop connector snapshot does not match the command kind");
        }
        const account = command.profile.creatorAccount;
        assertPilotGate({
            runtimeEnabled: options.runtimeReady ?? isLivePilotRuntimeReady(),
            agency: account.agency,
            account,
        }, "LIVE_PLATFORM_READ");
        const extendedLease = await tdb.desktopConnectorCommand.updateMany({
            where: {
                id: command.id,
                deviceId: input.deviceId,
                status: "LEASED",
                leaseOwner: input.page.deliveryId,
            },
            data: {
                leaseUntil: new Date(now.getTime() + DESKTOP_CONNECTOR_COMMAND_LEASE_MS),
            },
        });
        if (extendedLease.count !== 1) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_LEASE_INVALID", 409, "Desktop connector snapshot command lease could not be extended");
        }
        const pageDigest = input.page.resource === "MANIFEST"
            ? null
            : desktopConnectorSnapshotPageDigest(input.page);
        if (pageDigest) {
            const existingAuditRows = await tdb.auditLog.findMany({
                where: {
                    action: "connector.snapshot.ingested",
                    entityType: "DesktopConnectorCommand",
                    entityId: command.id,
                },
                select: { after: true },
            });
            const existingReceipt = existingAuditRows
                .map((row) => snapshotAuditReceipt(row.after))
                .find((receipt) => receipt?.pageIndex === input.page.pageIndex);
            if (existingReceipt) {
                if (existingReceipt.pageDigest !== pageDigest ||
                    existingReceipt.resource !== input.page.resource) {
                    throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_PAGE_CONFLICT", 409, "Desktop connector snapshot page conflicts with an earlier delivery");
                }
                return {
                    resource: input.page.resource,
                    itemCount: existingReceipt.itemCount,
                };
            }
        }
        let itemCount = 0;
        const capturedAt = new Date(input.page.capturedAt);
        if (input.page.resource === "MANIFEST") {
            const manifest = input.page;
            if (!manifest.isLastPage ||
                manifest.pageIndex !== manifest.pageCount) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_MANIFEST_INVALID", 409, "Desktop connector snapshot manifest position is invalid");
            }
            const auditRows = await tdb.auditLog.findMany({
                where: {
                    action: "connector.snapshot.ingested",
                    entityType: "DesktopConnectorCommand",
                    entityId: command.id,
                },
                select: { after: true },
            });
            const receipts = new Map<number, SnapshotAuditReceipt>();
            for (const row of auditRows) {
                const receipt = snapshotAuditReceipt(row.after);
                if (!receipt)
                    continue;
                const existing = receipts.get(receipt.pageIndex);
                if (existing &&
                    (existing.pageDigest !== receipt.pageDigest ||
                        existing.resource !== receipt.resource ||
                        existing.itemCount !== receipt.itemCount)) {
                    throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_PAGE_CONFLICT", 409, "Desktop connector snapshot page conflicts with an earlier delivery");
                }
                receipts.set(receipt.pageIndex, receipt);
            }
            if (receipts.size !== manifest.pageCount) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_INCOMPLETE", 409, "Desktop connector snapshot is missing pages");
            }
            const ordered: SnapshotAuditReceipt[] = [];
            for (let index = 0; index < manifest.pageCount; index += 1) {
                const receipt = receipts.get(index);
                if (!receipt) {
                    throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_INCOMPLETE", 409, "Desktop connector snapshot page sequence is incomplete");
                }
                ordered.push(receipt);
            }
            const calculatedDigest = desktopConnectorSnapshotDigestFromPageDigests(ordered.map((receipt) => receipt.pageDigest));
            const calculatedCounts = {
                fans: 0,
                messages: 0,
                transactions: 0,
                vaultItems: 0,
            };
            for (const receipt of ordered) {
                if (receipt.resource === "FANS") {
                    calculatedCounts.fans += receipt.itemCount;
                }
                else if (receipt.resource === "MESSAGES") {
                    calculatedCounts.messages += receipt.itemCount;
                }
                else if (receipt.resource === "TRANSACTIONS") {
                    calculatedCounts.transactions += receipt.itemCount;
                }
                else if (receipt.resource === "VAULT") {
                    calculatedCounts.vaultItems += receipt.itemCount;
                }
            }
            const receivedResources = new Set(ordered.map((receipt) => receipt.resource));
            const requiredResources: SnapshotAuditReceipt["resource"][] = [
                "IDENTITY",
                "FANS",
                "TRANSACTIONS",
                "VAULT",
            ];
            if (requiredResources.some((resource) => !receivedResources.has(resource))) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_INCOMPLETE", 409, "Desktop connector snapshot is missing a required resource");
            }
            if (calculatedDigest !== manifest.snapshotDigest ||
                Object.entries(calculatedCounts).some(([key, count]) => manifest.itemCounts[key as keyof typeof manifest.itemCounts] !==
                    count)) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_MANIFEST_MISMATCH", 409, "Desktop connector snapshot manifest does not match accepted pages");
            }
        }
        else if (input.page.resource === "IDENTITY") {
            if (command.profile.connection.remoteAccountId &&
                command.profile.connection.remoteAccountId !==
                    input.page.remoteAccountId) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_IDENTITY_CONFLICT", 409, "Desktop connector identity conflicts with the bound account");
            }
            const updated = await tdb.platformConnection.updateMany({
                where: {
                    id: command.profile.connectionId,
                    creatorAccountId: account.id,
                    platform: "fansly",
                    status: { not: "REVOKED" },
                    OR: [
                        { lastVerifiedAt: null },
                        { lastVerifiedAt: { lte: capturedAt } },
                    ],
                },
                data: {
                    remoteAccountId: input.page.remoteAccountId,
                    lastVerifiedAt: capturedAt,
                    lastErrorCode: null,
                },
            });
            if (updated.count !== 1 &&
                (!command.profile.connection.lastVerifiedAt ||
                    command.profile.connection.lastVerifiedAt <= capturedAt)) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_CONNECTION_INVALID", 409, "Desktop connector profile connection is not active");
            }
            itemCount = 1;
        }
        else if (input.page.resource === "FANS") {
            assertUniqueReferences(input.page.items.map((item) => item.externalFanRef), input.page.resource);
            for (const item of input.page.items) {
                const lastActiveAt = new Date(item.lastActiveAt);
                const fan = await tdb.fan.upsert({
                    where: {
                        creatorAccountId_externalFanRef: {
                            creatorAccountId: account.id,
                            externalFanRef: item.externalFanRef,
                        },
                    },
                    create: {
                        agencyId: input.agencyId,
                        creatorAccountId: account.id,
                        externalFanRef: item.externalFanRef,
                        username: item.username,
                        displayName: item.displayName,
                        subscribedAt: new Date(item.subscribedAt),
                        lastActiveAt: new Date(item.lastActiveAt),
                        subscriptionStatus: item.subscriptionStatus,
                    },
                    update: {},
                });
                await tdb.fan.updateMany({
                    where: {
                        id: fan.id,
                        lastActiveAt: { lte: lastActiveAt },
                    },
                    data: {
                        username: item.username,
                        displayName: item.displayName,
                        subscribedAt: new Date(item.subscribedAt),
                        lastActiveAt,
                        subscriptionStatus: item.subscriptionStatus,
                    },
                });
            }
            itemCount = input.page.items.length;
        }
        else if (input.page.resource === "MESSAGES") {
            assertUniqueReferences(input.page.items.map((item) => item.externalRef), input.page.resource);
            const fan = await tdb.fan.findUnique({
                where: {
                    creatorAccountId_externalFanRef: {
                        creatorAccountId: account.id,
                        externalFanRef: input.page.externalFanRef,
                    },
                },
                select: { id: true },
            });
            if (!fan) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_FAN_MISSING", 409, "Desktop connector message page references an unknown fan");
            }
            const conversation = await tdb.conversation.upsert({
                where: {
                    creatorAccountId_fanId: {
                        creatorAccountId: account.id,
                        fanId: fan.id,
                    },
                },
                create: {
                    agencyId: input.agencyId,
                    creatorAccountId: account.id,
                    fanId: fan.id,
                },
                update: {},
            });
            let latestMessageAt: Date | null = null;
            for (const item of input.page.items) {
                const sentAt = new Date(item.sentAt);
                await tdb.message.upsert({
                    where: {
                        conversationId_externalRef: {
                            conversationId: conversation.id,
                            externalRef: item.externalRef,
                        },
                    },
                    create: {
                        agencyId: input.agencyId,
                        conversationId: conversation.id,
                        externalRef: item.externalRef,
                        direction: item.direction,
                        body: item.body,
                        sentAt,
                        ppvPriceCents: item.ppvPriceCents,
                    },
                    update: {
                        externalRef: item.externalRef,
                    },
                });
                if (!latestMessageAt || sentAt > latestMessageAt) {
                    latestMessageAt = sentAt;
                }
            }
            if (latestMessageAt && latestMessageAt > conversation.lastMessageAt) {
                await tdb.conversation.update({
                    where: { id: conversation.id },
                    data: { lastMessageAt: latestMessageAt },
                });
            }
            itemCount = input.page.items.length;
        }
        else if (input.page.resource === "TRANSACTIONS") {
            assertUniqueReferences(input.page.items.map((item) => item.externalRef), input.page.resource);
            const touchedFanIds = new Set<string>();
            for (const item of input.page.items) {
                const fan = await tdb.fan.findUnique({
                    where: {
                        creatorAccountId_externalFanRef: {
                            creatorAccountId: account.id,
                            externalFanRef: item.externalFanRef,
                        },
                    },
                    select: { id: true },
                });
                if (!fan) {
                    throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_FAN_MISSING", 409, "Desktop connector transaction references an unknown fan");
                }
                await tdb.transaction.upsert({
                    where: {
                        creatorAccountId_externalRef: {
                            creatorAccountId: account.id,
                            externalRef: item.externalRef,
                        },
                    },
                    create: {
                        agencyId: input.agencyId,
                        creatorAccountId: account.id,
                        fanId: fan.id,
                        type: item.type,
                        amountCents: item.amountCents,
                        occurredAt: new Date(item.occurredAt),
                        externalRef: item.externalRef,
                    },
                    update: {
                        externalRef: item.externalRef,
                    },
                });
                touchedFanIds.add(fan.id);
            }
            for (const fanId of touchedFanIds) {
                const aggregate = await tdb.transaction.aggregate({
                    where: { fanId },
                    _sum: { amountCents: true },
                });
                await tdb.fan.update({
                    where: { id: fanId },
                    data: { totalSpentCents: aggregate._sum.amountCents ?? 0 },
                });
            }
            itemCount = input.page.items.length;
        }
        else {
            assertUniqueReferences(input.page.items.map((item) => item.externalRef), input.page.resource);
            for (const item of input.page.items) {
                const vaultItem = await tdb.vaultItem.upsert({
                    where: {
                        creatorAccountId_externalRef: {
                            creatorAccountId: account.id,
                            externalRef: item.externalRef,
                        },
                    },
                    create: {
                        agencyId: input.agencyId,
                        creatorAccountId: account.id,
                        externalRef: item.externalRef,
                        title: item.title,
                        mediaType: item.mediaType,
                        defaultPriceCents: item.defaultPriceCents,
                        tags: item.tags,
                        active: false,
                        platformStatus: "UNKNOWN",
                        lastVerifiedAt: capturedAt,
                    },
                    update: {},
                });
                await tdb.vaultItem.updateMany({
                    where: {
                        id: vaultItem.id,
                        OR: [
                            { lastVerifiedAt: null },
                            { lastVerifiedAt: { lte: capturedAt } },
                        ],
                    },
                    data: {
                        title: item.title,
                        mediaType: item.mediaType,
                        defaultPriceCents: item.defaultPriceCents,
                        tags: item.tags,
                        lastVerifiedAt: capturedAt,
                    },
                });
            }
            itemCount = input.page.items.length;
        }
        await logAudit(tdb, input.agencyId, {
            actorId: null,
            action: "connector.snapshot.ingested",
            entityType: "DesktopConnectorCommand",
            entityId: command.id,
            after: {
                resource: input.page.resource,
                pageIndex: input.page.pageIndex,
                isLastPage: input.page.isLastPage,
                itemCount,
                ...(input.page.resource === "MANIFEST"
                    ? {
                        pageCount: input.page.pageCount,
                        snapshotDigest: input.page.snapshotDigest,
                        itemCounts: input.page.itemCounts,
                    }
                    : {
                        pageDigest,
                    }),
            },
        });
        return { resource: input.page.resource, itemCount };
    }
    catch (error) {
        mapIngestionError(error);
    }
}
