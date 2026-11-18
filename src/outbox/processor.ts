import "server-only";
import crypto from "node:crypto";
import type { TenantDb } from "@/lib/tenant-db";
import { getAdapter } from "@/platform/registry";
import { toPlatformAccountContext, type PlatformAdapter, type SendResult } from "@/platform/adapter";
import { cancelClaimedDelivery, evaluateSendGuard } from "@/domain/send-guard";
import { evaluateQueuedAgentDeliveryPolicy } from "@/sales/policy";
import { evaluatePilotGate } from "@/pilot/policy";
import { isLivePilotRuntimeReady } from "@/pilot/runtime";
import { settleOutboundDeliveryAttempt } from "@/outbox/settlement";
import { dispatchDesktopTextDelivery } from "@/connector/server/text-delivery";
import { DesktopConnectorError } from "@/connector/server/errors";
import { effectiveVaultPricing } from "@/sales/pricing";
import { evaluateAiBillingGate } from "@/domain/commission";
const LEASE_MS = 30000;
type AdapterResolver = (platform: string) => PlatformAdapter;
export async function claimDelivery(tdb: TenantDb, deliveryId: string, now = new Date(), leaseOwner: string = crypto.randomUUID()): Promise<string | null> {
    const claimed = await tdb.outboundDelivery.updateMany({
        where: {
            id: deliveryId,
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
export async function recoverExpiredProcessing(tdb: TenantDb, now = new Date()): Promise<number> {
    const recovered = await tdb.outboundDelivery.updateMany({
        where: {
            status: "PROCESSING",
            leaseUntil: { lt: now },
        },
        data: {
            status: "CONFIRMING",
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: "WORKER_LOST_AFTER_SEND",
            lastErrorAt: now,
        },
    });
    return recovered.count;
}
export async function processDelivery(tdb: TenantDb, agencyId: string, deliveryId: string, options: {
    adapterResolver?: AdapterResolver;
    now?: () => Date;
} = {}): Promise<boolean> {
    const now = options.now?.() ?? new Date();
    const leaseOwner = await claimDelivery(tdb, deliveryId, now);
    if (!leaseOwner)
        return false;
    const delivery = await tdb.outboundDelivery.findUnique({
        where: { id: deliveryId },
        include: {
            agency: {
                select: {
                    status: true,
                    pilotEnabled: true,
                    dueDate: true,
                    paymentPending: true,
                },
            },
            message: {
                include: {
                    originAgentAction: {
                        include: {
                            agentRun: { select: { triggerMessageId: true, decision: true } },
                            followUpExecutionJob: {
                                select: {
                                    sequence: true,
                                    sourceAgentRunId: true,
                                    sourceAgentActionId: true,
                                },
                            },
                        },
                    },
                },
            },
            fan: true,
            conversation: true,
            creatorAccount: { include: { connection: true, salesProfile: true } },
            vaultSend: { include: { vaultItem: { include: { priceGroup: true } } } },
        },
    });
    if (!delivery || delivery.agencyId !== agencyId)
        return false;
    if (delivery.message.aiMode !== "NONE" &&
        !evaluateAiBillingGate({
            agencyStatus: delivery.agency.status,
            dueDate: delivery.agency.dueDate,
            paymentPending: delivery.agency.paymentPending,
        }).allowed) {
        await cancelClaimedDelivery(tdb, delivery.id, leaseOwner, "AI_PAYMENT_OVERDUE", options.now?.() ?? new Date());
        return false;
    }
    const guard = evaluateSendGuard({
        agencyStatus: delivery.agency.status,
        account: delivery.creatorAccount,
    }, delivery.kind);
    const autoReplyGuard = delivery.message.aiMode === "AUTO"
        ? evaluateSendGuard({
            agencyStatus: delivery.agency.status,
            account: delivery.creatorAccount,
        }, "AUTO_REPLY")
        : { allowed: true as const };
    const deniedSendGuard = !guard.allowed
        ? guard
        : !autoReplyGuard.allowed
            ? autoReplyGuard
            : null;
    if (deniedSendGuard) {
        await cancelClaimedDelivery(tdb, delivery.id, leaseOwner, deniedSendGuard.code, options.now?.() ?? new Date());
        return false;
    }
    const pilotGate = evaluatePilotGate({
        runtimeEnabled: isLivePilotRuntimeReady(),
        agency: delivery.agency,
        account: delivery.creatorAccount,
    }, delivery.message.aiMode === "AUTO"
        ? "LIVE_PLATFORM_WRITE_AUTO"
        : "LIVE_PLATFORM_WRITE_ASSIST");
    if (!pilotGate.allowed) {
        await cancelClaimedDelivery(tdb, delivery.id, leaseOwner, pilotGate.code, options.now?.() ?? new Date());
        return false;
    }
    if (delivery.message.aiMode === "AUTO" &&
        (delivery.conversation.controlMode === "HUMAN" ||
            Boolean(delivery.conversation.handoffStatus) ||
            delivery.conversation.takenOverAt !== null)) {
        await cancelClaimedDelivery(tdb, delivery.id, leaseOwner, "HUMAN_TAKEOVER_ACTIVE", options.now?.() ?? new Date());
        return false;
    }
    const originAction = delivery.message.originAgentAction;
    if (originAction) {
        const latestInbound = await tdb.message.findFirst({
            where: { conversationId: delivery.conversationId, direction: "IN" },
            orderBy: { sentAt: "desc" },
            select: { id: true },
        });
        const confidenceValue = originAction.agentRun.decision &&
            typeof originAction.agentRun.decision === "object" &&
            !Array.isArray(originAction.agentRun.decision)
            ? (originAction.agentRun.decision as {
                confidence?: unknown;
            }).confidence
            : null;
        const alreadyPurchased = delivery.vaultSend
            ? (await tdb.vaultSend.findFirst({
                where: {
                    fanId: delivery.fanId,
                    vaultItemId: delivery.vaultSend.vaultItemId,
                    purchasedAt: { not: null },
                },
                select: { id: true },
            })) !== null
            : false;
        const deliveryPricing = delivery.vaultSend
            ? effectiveVaultPricing(delivery.vaultSend.vaultItem)
            : null;
        const policy = evaluateQueuedAgentDeliveryPolicy({
            actionStatus: originAction.status,
            aiMode: delivery.message.aiMode,
            sentByUserId: delivery.message.sentByUserId,
            controlMode: delivery.conversation.controlMode,
            salesStage: delivery.conversation.salesStage,
            takenOverAt: delivery.conversation.takenOverAt,
            contactOptOutAt: delivery.fan.contactOptOutAt,
            triggerMessageId: originAction.agentRun.triggerMessageId,
            latestInboundMessageId: latestInbound?.id ?? null,
            confidence: typeof confidenceValue === "number" && Number.isFinite(confidenceValue)
                ? confidenceValue
                : null,
            isPpv: delivery.kind === "PPV",
            alreadyPurchased,
            requestedPriceCents: delivery.vaultSend?.priceCents,
            approvedPriceCents: deliveryPricing?.basePriceCents,
            minPriceCents: deliveryPricing?.minPriceCents,
            maxPriceCents: deliveryPricing?.maxPriceCents,
            priceMode: deliveryPricing?.priceMode,
            vaultItemOfferable: delivery.vaultSend
                ? delivery.vaultSend.vaultItem.active &&
                    delivery.vaultSend.vaultItem.platformStatus === "READY" &&
                    delivery.vaultSend.vaultItem.lastVerifiedAt !== null
                : undefined,
            globalPriceCapCents: delivery.creatorAccount.salesProfile?.globalPriceCapCents,
        });
        if (!policy.allowed) {
            await Promise.all([
                cancelClaimedDelivery(tdb, delivery.id, leaseOwner, policy.code, options.now?.() ?? new Date()),
                tdb.agentAction.updateMany({
                    where: { id: originAction.id, status: "EXECUTING" },
                    data: {
                        status: "DENIED",
                        reasonCode: policy.code,
                        executedAt: options.now?.() ?? new Date(),
                    },
                }),
            ]);
            return false;
        }
    }
    if (delivery.creatorAccount.platform === "fansly" &&
        delivery.kind === "TEXT") {
        try {
            await dispatchDesktopTextDelivery(tdb, {
                agencyId,
                deliveryId: delivery.id,
                leaseOwner,
                now,
            });
            return true;
        }
        catch (error) {
            await cancelClaimedDelivery(tdb, delivery.id, leaseOwner, error instanceof DesktopConnectorError
                ? error.code
                : "DESKTOP_CONNECTOR_SEND_DISPATCH_FAILED", options.now?.() ?? new Date());
            return false;
        }
    }
    const attemptNumber = delivery.attemptCount + 1;
    const startedAt = now;
    let result: SendResult;
    try {
        const adapter = (options.adapterResolver ?? getAdapter)(delivery.creatorAccount.platform);
        result = await adapter.sendMessage(toPlatformAccountContext(delivery.creatorAccount), delivery.fan.externalFanRef, {
            body: delivery.message.body,
            ppv: delivery.vaultSend
                ? {
                    vaultItemExternalRef: delivery.vaultSend.vaultItem.externalRef ??
                        delivery.vaultSend.vaultItem.id,
                    priceCents: delivery.vaultSend.priceCents,
                }
                : undefined,
        });
    }
    catch {
        result = {
            ok: false,
            failureKind: "AMBIGUOUS",
            errorCode: "NETWORK_RESULT_UNKNOWN",
        };
    }
    const finishedAt = options.now?.() ?? new Date();
    return settleOutboundDeliveryAttempt(tdb, {
        agencyId,
        deliveryId: delivery.id,
        attemptNumber,
        leaseOwner,
        startedAt,
        finishedAt,
        result,
    });
}
export async function processDueDeliveries(tdb: TenantDb, agencyId: string, limit = 25): Promise<number> {
    const now = new Date();
    await recoverExpiredProcessing(tdb, now);
    const due = await tdb.outboundDelivery.findMany({
        where: {
            status: { in: ["PENDING", "RETRY"] },
            nextAttemptAt: { lte: now },
        },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        take: limit,
        select: { id: true },
    });
    let claimed = 0;
    for (const row of due) {
        if (await processDelivery(tdb, agencyId, row.id))
            claimed++;
    }
    return claimed;
}
