import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
type AiMode = "NONE" | "ASSIST" | "AUTO";
type CommonInput = {
    agencyId: string;
    creatorAccountId: string;
    connectionId: string;
    conversationId: string;
    fanId: string;
    clientRequestId: string;
    body: string;
    sentByUserId: string | null;
    aiMode: AiMode;
    originAgentActionId?: string | null;
};
export type EnqueueResult = {
    deliveryId: string;
    messageId: string;
    duplicate: boolean;
};
async function existingRequest(tdb: TenantDb, agencyId: string, clientRequestId: string): Promise<EnqueueResult | null> {
    const existing = await tdb.outboundDelivery.findUnique({
        where: { agencyId_clientRequestId: { agencyId, clientRequestId } },
        select: { id: true, messageId: true },
    });
    return existing
        ? { deliveryId: existing.id, messageId: existing.messageId, duplicate: true }
        : null;
}
function isUniqueViolation(error: unknown): boolean {
    return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
}
export async function enqueueTextDelivery(tdb: TenantDb, input: CommonInput): Promise<EnqueueResult> {
    const duplicate = await existingRequest(tdb, input.agencyId, input.clientRequestId);
    if (duplicate)
        return duplicate;
    const now = new Date();
    const messageId = crypto.randomUUID();
    const deliveryId = crypto.randomUUID();
    try {
        await tdb.$transaction([
            tdb.message.create({
                data: {
                    id: messageId,
                    agencyId: input.agencyId,
                    conversationId: input.conversationId,
                    direction: "OUT",
                    body: input.body,
                    sentByUserId: input.sentByUserId,
                    aiMode: input.aiMode,
                    originAgentActionId: input.originAgentActionId ?? null,
                    sentAt: now,
                },
            }),
            tdb.outboundDelivery.create({
                data: {
                    id: deliveryId,
                    agencyId: input.agencyId,
                    creatorAccountId: input.creatorAccountId,
                    connectionId: input.connectionId,
                    conversationId: input.conversationId,
                    fanId: input.fanId,
                    messageId,
                    clientRequestId: input.clientRequestId,
                    kind: "TEXT",
                    nextAttemptAt: now,
                },
            }),
            tdb.conversation.update({
                where: { id: input.conversationId },
                data: { lastMessageAt: now, unreadCount: 0 },
            }),
        ]);
    }
    catch (error) {
        if (isUniqueViolation(error)) {
            const raced = await existingRequest(tdb, input.agencyId, input.clientRequestId);
            if (raced)
                return raced;
        }
        throw error;
    }
    return { deliveryId, messageId, duplicate: false };
}
export async function enqueuePpvDelivery(tdb: TenantDb, input: CommonInput & {
    vaultItemId: string;
    priceCents: number;
}): Promise<EnqueueResult> {
    const duplicate = await existingRequest(tdb, input.agencyId, input.clientRequestId);
    if (duplicate)
        return duplicate;
    const now = new Date();
    const messageId = crypto.randomUUID();
    const vaultSendId = crypto.randomUUID();
    const deliveryId = crypto.randomUUID();
    try {
        await tdb.$transaction([
            tdb.message.create({
                data: {
                    id: messageId,
                    agencyId: input.agencyId,
                    conversationId: input.conversationId,
                    direction: "OUT",
                    body: input.body,
                    sentByUserId: input.sentByUserId,
                    aiMode: input.aiMode,
                    ppvPriceCents: input.priceCents,
                    originAgentActionId: input.originAgentActionId ?? null,
                    sentAt: now,
                },
            }),
            tdb.vaultSend.create({
                data: {
                    id: vaultSendId,
                    agencyId: input.agencyId,
                    vaultItemId: input.vaultItemId,
                    fanId: input.fanId,
                    messageId,
                    sentByUserId: input.sentByUserId,
                    aiMode: input.aiMode,
                    originAgentActionId: input.originAgentActionId ?? null,
                    priceCents: input.priceCents,
                    sentAt: now,
                },
            }),
            tdb.outboundDelivery.create({
                data: {
                    id: deliveryId,
                    agencyId: input.agencyId,
                    creatorAccountId: input.creatorAccountId,
                    connectionId: input.connectionId,
                    conversationId: input.conversationId,
                    fanId: input.fanId,
                    messageId,
                    vaultSendId,
                    clientRequestId: input.clientRequestId,
                    kind: "PPV",
                    nextAttemptAt: now,
                },
            }),
            tdb.conversation.update({
                where: { id: input.conversationId },
                data: { lastMessageAt: now, unreadCount: 0 },
            }),
        ]);
    }
    catch (error) {
        if (isUniqueViolation(error)) {
            const raced = await existingRequest(tdb, input.agencyId, input.clientRequestId);
            if (raced)
                return raced;
        }
        throw error;
    }
    return { deliveryId, messageId, duplicate: false };
}
