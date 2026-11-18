import type { TenantDb } from "@/lib/tenant-db";
import { getAdapter } from "@/platform/registry";
import { toPlatformAccountContext, type MessageDTO } from "@/platform/adapter";
import { reconcileAmbiguousOutbound } from "@/outbox/reconcile";
import { cancelConversationFollowUps } from "@/followup/cancel";
import { assertPilotGate } from "@/pilot/policy";
import { isLivePilotRuntimeReady } from "@/pilot/runtime";
import { openAiShadowReadiness } from "@/copilot/openai";
import { enqueueInboundEvent } from "@/inbound/enqueue";
import { reconcileFanvuePaymentAttribution } from "@/inbound/fanvue-payment-handler";
import { detectAndCreateContentRequest } from "@/notifications/content-request";
import { notifyLargePurchase, notifyNewLead } from "@/notifications/domain-events";
export interface SyncResult {
    fans: number;
    messages: number;
    transactions: number;
    vaultItems: number;
}
export type AccountRow = {
    id: string;
    agencyId: string;
    platform: string;
    externalAccountRef: string;
    status: string;
    activated: boolean;
    aiAutoReply: boolean;
    pilotMode: string;
    complianceApprovedAt: Date | null;
    dailyAiRunLimit: number;
    dailyAiCostLimitMicros: number;
    agency?: {
        status: string;
        pilotEnabled: boolean;
    };
    connection: {
        id: string;
        remoteAccountId: string | null;
        secretRef: string | null;
        grantedScopes: string[];
        capabilities: string[];
        lastSyncedAt: Date | null;
    } | null;
};
type SyncOptions = {
    shadowEnabled?: boolean;
    enqueueInbound?: typeof enqueueInboundEvent;
};
export function shouldEnqueueShadowMessage(account: AccountRow, messageSentAt: Date, shadowConfigured: boolean): boolean {
    const baseline = account.connection?.lastSyncedAt;
    return (shadowConfigured &&
        account.platform === "fanvue" &&
        account.pilotMode === "SHADOW" &&
        baseline instanceof Date &&
        messageSentAt > baseline);
}
async function enqueueShadowMessageIfEligible(tdb: TenantDb, agencyId: string, account: AccountRow & {
    connection: NonNullable<AccountRow["connection"]>;
}, dto: MessageDTO, shadowConfigured: boolean, enqueueInbound: typeof enqueueInboundEvent): Promise<void> {
    if (dto.direction !== "in" ||
        !shouldEnqueueShadowMessage(account, dto.sentAt, shadowConfigured)) {
        return;
    }
    await enqueueInbound(tdb, {
        agencyId,
        connectionId: account.connection.id,
        providerEventId: `shadow:${dto.externalRef}`,
        type: "fanvue.message.shadow",
        payload: { messageExternalRef: dto.externalRef },
        occurredAt: dto.sentAt,
    });
}
export const MAX_PLATFORM_SYNC_PAGES = 250;
export class PlatformSyncPaginationError extends Error {
    readonly code = "PLATFORM_SYNC_PAGINATION_INVALID";
    constructor(resource: string) {
        super(`Platform sync pagination is invalid for ${resource}`);
        this.name = "PlatformSyncPaginationError";
    }
}
export function boundedNextCursor(seen: Set<string>, nextCursor: string | undefined, completedPages: number, resource: string): string | undefined {
    if (!nextCursor)
        return undefined;
    if (completedPages >= MAX_PLATFORM_SYNC_PAGES ||
        seen.has(nextCursor)) {
        throw new PlatformSyncPaginationError(resource);
    }
    seen.add(nextCursor);
    return nextCursor;
}
export async function syncAccountData(tdb: TenantDb, agencyId: string, account: AccountRow, options: SyncOptions = {}): Promise<SyncResult> {
    assertPilotGate({
        runtimeEnabled: isLivePilotRuntimeReady(),
        agency: account.agency ?? { status: "SUSPENDED", pilotEnabled: false },
        account,
    }, "LIVE_PLATFORM_READ");
    if (!account.connection)
        throw new Error("Platform connection is missing");
    const connection = account.connection;
    const connectedAccount = { ...account, connection };
    const adapter = getAdapter(account.platform);
    const context = toPlatformAccountContext(account);
    const result: SyncResult = { fans: 0, messages: 0, transactions: 0, vaultItems: 0 };
    const shadowConfigured = options.shadowEnabled ?? openAiShadowReadiness().ready;
    const syncedAt = new Date();
    const vaultDtos = await adapter.getVaultItems(context);
    const vaultIdByRef = new Map<string, string>();
    if (account.platform === "fanvue" &&
        context.grantedScopes.includes("read:media")) {
        await tdb.vaultItem.updateMany({
            where: { creatorAccountId: account.id },
            data: {
                platformStatus: "UNAVAILABLE",
                lastVerifiedAt: syncedAt,
            },
        });
    }
    for (const item of vaultDtos) {
        const row = await tdb.vaultItem.upsert({
            where: {
                creatorAccountId_externalRef: {
                    creatorAccountId: account.id,
                    externalRef: item.externalRef,
                },
            },
            create: {
                agencyId,
                creatorAccountId: account.id,
                externalRef: item.externalRef,
                title: item.title,
                mediaType: item.mediaType.toUpperCase() as "PHOTO" | "VIDEO" | "AUDIO" | "BUNDLE",
                defaultPriceCents: item.defaultPriceCents,
                tags: item.tags,
                ...(account.platform === "mock"
                    ? {
                        active: true,
                        platformStatus: "READY" as const,
                        minPriceCents: 100,
                        maxPriceCents: item.defaultPriceCents,
                        approvedPriceCents: item.defaultPriceCents,
                        lastVerifiedAt: syncedAt,
                    }
                    : account.platform === "fanvue"
                        ? {
                            active: false,
                            platformStatus: "READY" as const,
                            minPriceCents: 300,
                            maxPriceCents: 50000,
                            approvedPriceCents: null,
                            lastVerifiedAt: syncedAt,
                        }
                        : {}),
            },
            update: {
                title: item.title,
                tags: item.tags,
                defaultPriceCents: item.defaultPriceCents,
                ...(account.platform === "mock"
                    ? {
                        active: true,
                        platformStatus: "READY" as const,
                        minPriceCents: 100,
                        maxPriceCents: item.defaultPriceCents,
                        approvedPriceCents: item.defaultPriceCents,
                        lastVerifiedAt: syncedAt,
                    }
                    : account.platform === "fanvue"
                        ? {
                            platformStatus: "READY" as const,
                            minPriceCents: 300,
                            maxPriceCents: 50000,
                            lastVerifiedAt: syncedAt,
                        }
                        : {}),
            },
        });
        vaultIdByRef.set(item.externalRef, row.id);
        result.vaultItems++;
    }
    const fanIdByRef = new Map<string, string>();
    let cursor: string | undefined;
    let fanPages = 0;
    const seenFanCursors = new Set<string>();
    do {
        fanPages++;
        const page = await adapter.getFans(context, cursor);
        for (const fan of page.items) {
            const knownFan = await tdb.fan.findUnique({
                where: {
                    creatorAccountId_externalFanRef: {
                        creatorAccountId: account.id,
                        externalFanRef: fan.externalFanRef,
                    },
                },
                select: { id: true },
            });
            const row = await tdb.fan.upsert({
                where: {
                    creatorAccountId_externalFanRef: {
                        creatorAccountId: account.id,
                        externalFanRef: fan.externalFanRef,
                    },
                },
                create: {
                    agencyId,
                    creatorAccountId: account.id,
                    externalFanRef: fan.externalFanRef,
                    username: fan.username,
                    displayName: fan.displayName,
                    subscribedAt: fan.subscribedAt,
                    lastActiveAt: fan.lastActiveAt,
                    subscriptionStatus: fan.subscriptionStatus === "active" ? "ACTIVE" : "EXPIRED",
                },
                update: {
                    username: fan.username,
                    displayName: fan.displayName,
                    ...(fan.subscribedAt.getTime() > 0
                        ? { subscribedAt: fan.subscribedAt }
                        : {}),
                    lastActiveAt: fan.lastActiveAt,
                    subscriptionStatus: fan.subscriptionStatus === "active" ? "ACTIVE" : "EXPIRED",
                },
            });
            if (!knownFan) {
                await notifyNewLead(tdb, {
                    agencyId,
                    creatorAccountId: account.id,
                    fanId: row.id,
                    displayName: row.displayName,
                });
            }
            fanIdByRef.set(fan.externalFanRef, row.id);
            result.fans++;
        }
        cursor = boundedNextCursor(seenFanCursors, page.nextCursor, fanPages, "fans");
    } while (cursor);
    for (const [fanRef, fanId] of fanIdByRef) {
        const conversation = await tdb.conversation.upsert({
            where: {
                creatorAccountId_fanId: { creatorAccountId: account.id, fanId },
            },
            create: { agencyId, creatorAccountId: account.id, fanId },
            update: {},
        });
        const existing = await tdb.message.findMany({
            where: { conversationId: conversation.id, externalRef: { not: null } },
            select: { id: true, externalRef: true },
        });
        const seen = new Set(existing.map((m) => m.externalRef));
        const existingMessageIdByRef = new Map(existing.flatMap((message) => message.externalRef ? [[message.externalRef, message.id] as const] : []));
        const dtos: MessageDTO[] = [];
        let msgCursor: string | undefined;
        let messagePages = 0;
        const seenMessageCursors = new Set<string>();
        do {
            messagePages++;
            const page = await adapter.getConversation(context, fanRef, msgCursor);
            dtos.push(...page.items);
            msgCursor = boundedNextCursor(seenMessageCursors, page.nextCursor, messagePages, `messages:${fanRef}`);
        } while (msgCursor);
        let lastAt: Date | null = null;
        for (const dto of dtos) {
            if (seen.has(dto.externalRef)) {
                const existingMessageId = existingMessageIdByRef.get(dto.externalRef);
                if (existingMessageId && dto.ppv?.purchasedAt) {
                    await tdb.vaultSend.updateMany({
                        where: { messageId: existingMessageId, purchasedAt: null },
                        data: { purchasedAt: dto.ppv.purchasedAt },
                    });
                }
                await enqueueShadowMessageIfEligible(tdb, agencyId, connectedAccount, dto, shadowConfigured, options.enqueueInbound ?? enqueueInboundEvent);
                if (account.platform === "fanvue" && dto.ppv) {
                    await reconcileFanvuePaymentAttribution(tdb, {
                        creatorAccountId: account.id,
                        fanId,
                        providerMessageRef: dto.externalRef,
                    });
                }
                continue;
            }
            if (await reconcileAmbiguousOutbound(tdb, agencyId, conversation.id, dto)) {
                if (account.platform === "fanvue" && dto.ppv) {
                    await reconcileFanvuePaymentAttribution(tdb, {
                        creatorAccountId: account.id,
                        fanId,
                        providerMessageRef: dto.externalRef,
                    });
                }
                seen.add(dto.externalRef);
                result.messages++;
                if (!lastAt || dto.sentAt > lastAt)
                    lastAt = dto.sentAt;
                continue;
            }
            const message = await tdb.message.create({
                data: {
                    agencyId,
                    conversationId: conversation.id,
                    direction: dto.direction === "in" ? "IN" : "OUT",
                    body: dto.body,
                    sentAt: dto.sentAt,
                    externalRef: dto.externalRef,
                    ppvPriceCents: dto.ppv?.priceCents ?? null,
                },
            });
            result.messages++;
            if (dto.direction === "in") {
                await cancelConversationFollowUps(tdb, conversation.id, "NEW_INBOUND", dto.sentAt);
                await enqueueShadowMessageIfEligible(tdb, agencyId, connectedAccount, dto, shadowConfigured, options.enqueueInbound ?? enqueueInboundEvent);
                await detectAndCreateContentRequest(tdb, {
                    agencyId,
                    creatorAccountId: account.id,
                    conversationId: conversation.id,
                    sourceMessageId: message.id,
                    messageBody: dto.body,
                });
            }
            if (dto.ppv) {
                const vaultItemId = vaultIdByRef.get(dto.ppv.vaultItemExternalRef);
                if (vaultItemId) {
                    await tdb.vaultSend.create({
                        data: {
                            agencyId,
                            vaultItemId,
                            fanId,
                            messageId: message.id,
                            priceCents: dto.ppv.priceCents,
                            sentAt: dto.sentAt,
                            purchasedAt: dto.ppv.purchasedAt ??
                                (dto.ppv.purchased ? dto.sentAt : null),
                        },
                    });
                }
            }
            if (account.platform === "fanvue" && dto.ppv) {
                await reconcileFanvuePaymentAttribution(tdb, {
                    creatorAccountId: account.id,
                    fanId,
                    providerMessageRef: dto.externalRef,
                });
            }
            if (!lastAt || dto.sentAt > lastAt)
                lastAt = dto.sentAt;
        }
        if (lastAt) {
            await tdb.conversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: lastAt },
            });
        }
    }
    const txDtos = await adapter.getTransactions(context, connection.lastSyncedAt ?? undefined);
    for (const tx of txDtos) {
        let fanId = fanIdByRef.get(tx.fanExternalRef);
        if (!fanId) {
            const knownFan = await tdb.fan.findUnique({
                where: {
                    creatorAccountId_externalFanRef: {
                        creatorAccountId: account.id,
                        externalFanRef: tx.fanExternalRef,
                    },
                },
                select: { id: true },
            });
            if (knownFan) {
                fanId = knownFan.id;
            }
            else {
                const createdFan = await tdb.fan.create({
                    data: {
                        agencyId,
                        creatorAccountId: account.id,
                        externalFanRef: tx.fanExternalRef,
                        username: tx.fanUsername ?? tx.fanExternalRef,
                        displayName: tx.fanDisplayName ?? tx.fanUsername ?? tx.fanExternalRef,
                        subscribedAt: tx.occurredAt,
                        lastActiveAt: tx.occurredAt,
                        subscriptionStatus: "EXPIRED",
                    },
                    select: { id: true, displayName: true },
                });
                fanId = createdFan.id;
                await notifyNewLead(tdb, {
                    agencyId,
                    creatorAccountId: account.id,
                    fanId,
                    displayName: createdFan.displayName,
                });
            }
            fanIdByRef.set(tx.fanExternalRef, fanId);
        }
        const mappedType = tx.type === "subscription"
            ? "SUBSCRIPTION"
            : tx.type === "ppv"
                ? "PPV"
                : "TIP";
        const currency = tx.currency ?? "USD";
        const existing = await tdb.transaction.findFirst({
            where: { creatorAccountId: account.id, externalRef: tx.externalRef },
        });
        if (existing &&
            (existing.fanId !== fanId ||
                existing.type !== mappedType ||
                existing.amountCents !== tx.amountCents ||
                existing.currency !== currency ||
                (existing.providerMessageRef !== null &&
                    tx.providerMessageRef !== undefined &&
                    existing.providerMessageRef !== tx.providerMessageRef))) {
            throw new Error("Platform transaction conflicts with persisted revenue");
        }
        if (existing && !existing.providerMessageRef && tx.providerMessageRef) {
            await tdb.transaction.update({
                where: { id: existing.id },
                data: { providerMessageRef: tx.providerMessageRef },
            });
        }
        const purchaseConversation = await tdb.conversation.findFirst({
            where: { creatorAccountId: account.id, fanId },
            select: { id: true },
        });
        if (purchaseConversation) {
            await cancelConversationFollowUps(tdb, purchaseConversation.id, "PURCHASE_CONFIRMED", tx.occurredAt);
        }
        if (existing) {
            if (tx.providerMessageRef) {
                await reconcileFanvuePaymentAttribution(tdb, {
                    creatorAccountId: account.id,
                    fanId,
                    providerMessageRef: tx.providerMessageRef,
                    purchasedAt: tx.occurredAt,
                });
            }
            continue;
        }
        let vaultSendId: string | null = null;
        let originAgentActionId: string | null = null;
        let aiMode: "NONE" | "ASSIST" | "AUTO" = "NONE";
        if (tx.type === "ppv" && tx.vaultItemExternalRef) {
            const vaultItemId = vaultIdByRef.get(tx.vaultItemExternalRef);
            if (vaultItemId) {
                const send = await tdb.vaultSend.findFirst({
                    where: {
                        fanId,
                        vaultItemId,
                        transaction: null,
                        sentAt: { lte: tx.occurredAt },
                    },
                    orderBy: { sentAt: "desc" },
                });
                if (send) {
                    vaultSendId = send.id;
                    originAgentActionId = send.originAgentActionId;
                    aiMode = send.aiMode;
                    if (!send.purchasedAt) {
                        await tdb.vaultSend.update({
                            where: { id: send.id },
                            data: { purchasedAt: tx.occurredAt },
                        });
                    }
                }
            }
        }
        const createdTransaction = await tdb.transaction.create({
            data: {
                agencyId,
                creatorAccountId: account.id,
                fanId,
                type: mappedType,
                amountCents: tx.amountCents,
                currency,
                occurredAt: tx.occurredAt,
                externalRef: tx.externalRef,
                providerMessageRef: tx.providerMessageRef,
                vaultSendId,
                originAgentActionId,
                aiMode,
            },
        });
        await notifyLargePurchase(tdb, {
            agencyId,
            creatorAccountId: account.id,
            transactionId: createdTransaction.id,
            fanId,
            amountCents: tx.amountCents,
            conversationId: purchaseConversation?.id,
        });
        if (tx.providerMessageRef) {
            await reconcileFanvuePaymentAttribution(tdb, {
                creatorAccountId: account.id,
                fanId,
                providerMessageRef: tx.providerMessageRef,
                purchasedAt: tx.occurredAt,
            });
        }
        result.transactions++;
    }
    for (const fanId of fanIdByRef.values()) {
        const agg = await tdb.transaction.aggregate({
            where: { fanId },
            _sum: { amountCents: true },
        });
        await tdb.fan.update({
            where: { id: fanId },
            data: { totalSpentCents: agg._sum.amountCents ?? 0 },
        });
    }
    return result;
}
