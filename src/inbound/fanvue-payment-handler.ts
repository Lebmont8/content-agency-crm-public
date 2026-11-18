import { z } from "zod";
import type { TenantDb } from "@/lib/tenant-db";
import { InboundProcessingError } from "@/inbound/errors";
import type { InboundEventForHandler } from "@/inbound/types";
import { cancelConversationFollowUps } from "@/followup/cancel";
import { notifyLargePurchase, notifyNewLead } from "@/notifications/domain-events";
const paymentSchema = z.object({
    object: z.literal("payment"),
    id: z.string().min(1).max(240),
    status: z.literal("succeeded"),
    source: z.enum(["post", "message", "media", "tip", "subscription"]),
    billing_reason: z.enum([
        "one_time",
        "subscription_initial",
        "subscription_renewal",
    ]),
    gross: z.number().int().positive(),
    currency: z.string().length(3),
    paid_in_full: z.literal(true),
    message_uuid: z.string().min(1).max(240).nullish(),
    created_at: z.string().datetime({ offset: true }).nullish(),
    paid_at: z.string().datetime({ offset: true }).nullish(),
    purchaser: z.object({
        uuid: z.string().min(1).max(240),
        handle: z.string().min(1).max(240).optional(),
        display_name: z.string().min(1).max(240).optional(),
    }).passthrough(),
    creator: z.object({ uuid: z.string().min(1).max(240) }).passthrough(),
}).passthrough();
function transactionType(source: z.infer<typeof paymentSchema>["source"]): "SUBSCRIPTION" | "PPV" | "TIP" {
    if (source === "subscription")
        return "SUBSCRIPTION";
    if (source === "tip")
        return "TIP";
    return "PPV";
}
export async function reconcileFanvuePaymentAttribution(tdb: TenantDb, input: {
    creatorAccountId: string;
    fanId: string;
    providerMessageRef: string;
    purchasedAt?: Date;
}): Promise<boolean> {
    const message = await tdb.message.findFirst({
        where: {
            externalRef: input.providerMessageRef,
            conversation: {
                creatorAccountId: input.creatorAccountId,
                fanId: input.fanId,
            },
        },
        include: { vaultSend: true },
    });
    if (!message?.vaultSend)
        return false;
    const transaction = await tdb.transaction.findFirst({
        where: {
            creatorAccountId: input.creatorAccountId,
            fanId: input.fanId,
            providerMessageRef: input.providerMessageRef,
            vaultSendId: null,
        },
        select: { id: true, occurredAt: true },
    });
    if (!transaction)
        return false;
    const purchasedAt = input.purchasedAt ?? transaction.occurredAt;
    await tdb.$transaction([
        tdb.transaction.updateMany({
            where: { id: transaction.id, vaultSendId: null },
            data: {
                vaultSendId: message.vaultSend.id,
                closedByUserId: message.vaultSend.sentByUserId,
                aiMode: message.vaultSend.aiMode,
                originAgentActionId: message.vaultSend.originAgentActionId,
            },
        }),
        tdb.vaultSend.updateMany({
            where: { id: message.vaultSend.id, purchasedAt: null },
            data: { purchasedAt },
        }),
    ]);
    return true;
}
export async function handleFanvuePaymentSucceeded(tdb: TenantDb, event: InboundEventForHandler): Promise<void> {
    const parsed = paymentSchema.safeParse(event.payload);
    if (!parsed.success) {
        throw new InboundProcessingError("FANVUE_PAYMENT_PAYLOAD_INVALID", false);
    }
    const payment = parsed.data;
    if (payment.currency.toUpperCase() !== "USD") {
        throw new InboundProcessingError("FANVUE_PAYMENT_CURRENCY_UNSUPPORTED", false);
    }
    if (payment.source === "message" && !payment.message_uuid) {
        throw new InboundProcessingError("FANVUE_PAYMENT_MESSAGE_REF_MISSING", false);
    }
    const providerMessageRef = payment.source === "message" ? payment.message_uuid ?? null : null;
    const connection = await tdb.platformConnection.findUnique({
        where: { id: event.connectionId },
        select: {
            platform: true,
            remoteAccountId: true,
            creatorAccountId: true,
        },
    });
    if (!connection ||
        connection.platform !== "fanvue" ||
        connection.remoteAccountId !== payment.creator.uuid) {
        throw new InboundProcessingError("FANVUE_PAYMENT_CONNECTION_INVALID", false);
    }
    const occurredAt = new Date(payment.paid_at ?? payment.created_at ?? event.occurredAt.toISOString());
    const username = payment.purchaser.handle ?? payment.purchaser.uuid;
    const displayName = payment.purchaser.display_name ?? username;
    const knownFan = await tdb.fan.findUnique({
        where: {
            creatorAccountId_externalFanRef: {
                creatorAccountId: connection.creatorAccountId,
                externalFanRef: payment.purchaser.uuid,
            },
        },
        select: { id: true },
    });
    const fan = await tdb.fan.upsert({
        where: {
            creatorAccountId_externalFanRef: {
                creatorAccountId: connection.creatorAccountId,
                externalFanRef: payment.purchaser.uuid,
            },
        },
        create: {
            agencyId: event.agencyId,
            creatorAccountId: connection.creatorAccountId,
            externalFanRef: payment.purchaser.uuid,
            username,
            displayName,
            subscribedAt: occurredAt,
            lastActiveAt: occurredAt,
        },
        update: { username, displayName },
    });
    if (!knownFan) {
        await notifyNewLead(tdb, {
            agencyId: event.agencyId,
            creatorAccountId: connection.creatorAccountId,
            fanId: fan.id,
            displayName: fan.displayName,
        });
    }
    let messageExists = true;
    if (providerMessageRef) {
        messageExists =
            (await tdb.message.findFirst({
                where: {
                    externalRef: providerMessageRef,
                    conversation: {
                        creatorAccountId: connection.creatorAccountId,
                        fanId: fan.id,
                    },
                },
                select: { id: true },
            })) !== null;
        if (!messageExists && event.attemptCount === 0) {
            throw new InboundProcessingError("FANVUE_PAYMENT_MESSAGE_PENDING", true);
        }
    }
    const type = transactionType(payment.source);
    const existing = await tdb.transaction.findUnique({
        where: {
            creatorAccountId_externalRef: {
                creatorAccountId: connection.creatorAccountId,
                externalRef: payment.id,
            },
        },
    });
    if (existing &&
        (existing.fanId !== fan.id ||
            existing.amountCents !== payment.gross ||
            existing.type !== type ||
            existing.currency !== "USD" ||
            (existing.providerMessageRef !== null &&
                providerMessageRef !== null &&
                existing.providerMessageRef !== providerMessageRef))) {
        throw new InboundProcessingError("FANVUE_PAYMENT_CONFLICT", false);
    }
    let createdTransactionId: string | null = null;
    if (!existing) {
        const createdTransaction = await tdb.transaction.create({
            data: {
                agencyId: event.agencyId,
                creatorAccountId: connection.creatorAccountId,
                fanId: fan.id,
                type,
                amountCents: payment.gross,
                currency: "USD",
                occurredAt,
                externalRef: payment.id,
                providerMessageRef,
            },
        });
        createdTransactionId = createdTransaction.id;
    }
    else if (!existing.providerMessageRef && providerMessageRef) {
        await tdb.transaction.update({
            where: { id: existing.id },
            data: { providerMessageRef },
        });
    }
    if (providerMessageRef && messageExists) {
        await reconcileFanvuePaymentAttribution(tdb, {
            creatorAccountId: connection.creatorAccountId,
            fanId: fan.id,
            providerMessageRef,
            purchasedAt: occurredAt,
        });
    }
    const conversation = await tdb.conversation.findFirst({
        where: { creatorAccountId: connection.creatorAccountId, fanId: fan.id },
        select: { id: true },
    });
    if (conversation) {
        await cancelConversationFollowUps(tdb, conversation.id, "PURCHASE_CONFIRMED", occurredAt);
    }
    if (createdTransactionId) {
        await notifyLargePurchase(tdb, {
            agencyId: event.agencyId,
            creatorAccountId: connection.creatorAccountId,
            transactionId: createdTransactionId,
            fanId: fan.id,
            amountCents: payment.gross,
            conversationId: conversation?.id,
        });
    }
    const aggregate = await tdb.transaction.aggregate({
        where: { fanId: fan.id },
        _sum: { amountCents: true },
    });
    await tdb.fan.update({
        where: { id: fan.id },
        data: { totalSpentCents: aggregate._sum.amountCents ?? 0 },
    });
}
