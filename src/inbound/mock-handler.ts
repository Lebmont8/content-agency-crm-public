import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { TenantDb } from "@/lib/tenant-db";
import { InboundProcessingError } from "@/inbound/errors";
import type { InboundEventForHandler } from "@/inbound/types";
import { runSalesOrchestrator } from "@/sales/orchestrator";
import { cancelConversationFollowUps } from "@/followup/cancel";
import { detectAndCreateContentRequest } from "@/notifications/content-request";
const mockMessagePayload = z
    .object({
    fanExternalRef: z.string().min(1).max(240),
    body: z.string().min(1).max(10000),
    sentAt: z.string().datetime(),
})
    .strict();
type SalesOrchestrator = typeof runSalesOrchestrator;
function isUniqueViolation(error: unknown): boolean {
    return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
}
export async function handleMockMessageReceived(tdb: TenantDb, event: InboundEventForHandler, options: {
    orchestrator?: SalesOrchestrator;
} = {}): Promise<void> {
    const parsed = mockMessagePayload.safeParse(event.payload);
    if (!parsed.success) {
        throw new InboundProcessingError("MOCK_PAYLOAD_INVALID", false);
    }
    const connection = await tdb.platformConnection.findUnique({
        where: { id: event.connectionId },
        include: { creatorAccount: { include: { salesProfile: true } } },
    });
    if (!connection || connection.platform !== "mock") {
        throw new InboundProcessingError("MOCK_CONNECTION_NOT_FOUND", false);
    }
    const fan = await tdb.fan.findUnique({
        where: {
            creatorAccountId_externalFanRef: {
                creatorAccountId: connection.creatorAccountId,
                externalFanRef: parsed.data.fanExternalRef,
            },
        },
    });
    if (!fan)
        throw new InboundProcessingError("MOCK_FAN_NOT_FOUND", false);
    const conversation = await tdb.conversation.upsert({
        where: {
            creatorAccountId_fanId: {
                creatorAccountId: connection.creatorAccountId,
                fanId: fan.id,
            },
        },
        create: {
            agencyId: event.agencyId,
            creatorAccountId: connection.creatorAccountId,
            fanId: fan.id,
            controlMode: connection.creatorAccount.aiAutoReply
                ? (connection.creatorAccount.salesProfile?.defaultControlMode ?? "AUTO")
                : "HUMAN",
        },
        update: {},
    });
    const existing = await tdb.message.findUnique({
        where: {
            conversationId_externalRef: {
                conversationId: conversation.id,
                externalRef: event.providerEventId,
            },
        },
        select: { id: true },
    });
    let triggerMessageId = existing?.id ?? null;
    let messageCreated = false;
    if (!triggerMessageId) {
        const sentAt = new Date(parsed.data.sentAt);
        const messageId = crypto.randomUUID();
        try {
            await tdb.$transaction([
                tdb.message.create({
                    data: {
                        id: messageId,
                        agencyId: event.agencyId,
                        conversationId: conversation.id,
                        direction: "IN",
                        body: parsed.data.body,
                        sentAt,
                        externalRef: event.providerEventId,
                    },
                }),
                tdb.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        lastMessageAt: sentAt,
                        unreadCount: { increment: 1 },
                    },
                }),
                tdb.fan.update({
                    where: { id: fan.id },
                    data: { lastActiveAt: sentAt },
                }),
            ]);
            triggerMessageId = messageId;
            messageCreated = true;
        }
        catch (error) {
            if (!isUniqueViolation(error))
                throw error;
            const raced = await tdb.message.findUnique({
                where: {
                    conversationId_externalRef: {
                        conversationId: conversation.id,
                        externalRef: event.providerEventId,
                    },
                },
                select: { id: true },
            });
            triggerMessageId = raced?.id ?? null;
        }
    }
    if (!triggerMessageId) {
        throw new InboundProcessingError("MOCK_MESSAGE_PERSIST_FAILED", true);
    }
    await cancelConversationFollowUps(tdb, conversation.id, "NEW_INBOUND", new Date(parsed.data.sentAt));
    if (messageCreated) {
        await detectAndCreateContentRequest(tdb, {
            agencyId: event.agencyId,
            creatorAccountId: connection.creatorAccountId,
            conversationId: conversation.id,
            sourceMessageId: triggerMessageId,
            messageBody: parsed.data.body,
        });
    }
    if (connection.creatorAccount.aiAutoReply &&
        conversation.controlMode !== "HUMAN" &&
        !conversation.handoffStatus) {
        await (options.orchestrator ?? runSalesOrchestrator)(tdb, {
            agencyId: event.agencyId,
            inboundEventId: event.id,
            conversationId: conversation.id,
            triggerMessageId,
        });
    }
}
