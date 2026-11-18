import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { TenantDb } from "@/lib/tenant-db";
import { InboundProcessingError } from "@/inbound/errors";
import type { InboundEventForHandler } from "@/inbound/types";
import { runSalesOrchestrator } from "@/sales/orchestrator";
import { cancelConversationFollowUps } from "@/followup/cancel";
import type { Copilot } from "@/copilot";
import { createOpenAiLiveCopilot, openAiLiveReadiness } from "@/copilot/openai";
import { detectAndCreateContentRequest } from "@/notifications/content-request";
const fanslyMessagePayload = z
    .object({
    profileId: z.string().min(1).max(128),
    externalMessageRef: z.string().min(1).max(256),
    externalFanRef: z.string().min(1).max(256),
    body: z.string().min(1).max(4000),
    sentAt: z.string().datetime(),
})
    .strict();
type SalesOrchestrator = typeof runSalesOrchestrator;
function isUniqueViolation(error: unknown): boolean {
    return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
}
export async function handleFanslyMessageReceived(tdb: TenantDb, event: InboundEventForHandler, options: {
    orchestrator?: SalesOrchestrator;
    copilot?: Copilot;
    env?: Readonly<Record<string, string | undefined>>;
} = {}): Promise<void> {
    const payload = fanslyMessagePayload.safeParse(event.payload);
    if (!payload.success) {
        throw new InboundProcessingError("FANSLY_MESSAGE_PAYLOAD_INVALID", false);
    }
    const connection = await tdb.platformConnection.findUnique({
        where: { id: event.connectionId },
        include: {
            creatorAccount: { include: { salesProfile: true } },
            desktopConnectorProfile: {
                select: { id: true, status: true, platform: true },
            },
        },
    });
    if (!connection ||
        connection.agencyId !== event.agencyId ||
        connection.platform !== "fansly" ||
        connection.status !== "ACTIVE" ||
        !connection.capabilities.includes("sync") ||
        connection.desktopConnectorProfile?.id !== payload.data.profileId ||
        connection.desktopConnectorProfile.status !== "READY" ||
        connection.desktopConnectorProfile.platform !== "fansly") {
        throw new InboundProcessingError("FANSLY_CONNECTION_INVALID", false);
    }
    const fan = await tdb.fan.findUnique({
        where: {
            creatorAccountId_externalFanRef: {
                creatorAccountId: connection.creatorAccountId,
                externalFanRef: payload.data.externalFanRef,
            },
        },
    });
    if (!fan) {
        throw new InboundProcessingError("FANSLY_FAN_NOT_SYNCED", true);
    }
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
                externalRef: payload.data.externalMessageRef,
            },
        },
        select: { id: true },
    });
    let triggerMessageId = existing?.id ?? null;
    let messageCreated = false;
    const sentAt = new Date(payload.data.sentAt);
    if (!triggerMessageId) {
        const messageId = crypto.randomUUID();
        try {
            await tdb.$transaction([
                tdb.message.create({
                    data: {
                        id: messageId,
                        agencyId: event.agencyId,
                        conversationId: conversation.id,
                        direction: "IN",
                        body: payload.data.body,
                        sentAt,
                        externalRef: payload.data.externalMessageRef,
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
                        externalRef: payload.data.externalMessageRef,
                    },
                },
                select: { id: true },
            });
            triggerMessageId = raced?.id ?? null;
        }
    }
    if (!triggerMessageId) {
        throw new InboundProcessingError("FANSLY_MESSAGE_PERSIST_FAILED", true);
    }
    await cancelConversationFollowUps(tdb, conversation.id, "NEW_INBOUND", sentAt);
    if (messageCreated) {
        await detectAndCreateContentRequest(tdb, {
            agencyId: event.agencyId,
            creatorAccountId: connection.creatorAccountId,
            conversationId: conversation.id,
            sourceMessageId: triggerMessageId,
            messageBody: payload.data.body,
        });
    }
    if (connection.creatorAccount.aiAutoReply &&
        conversation.controlMode !== "HUMAN" &&
        !conversation.handoffStatus) {
        const readiness = options.copilot
            ? null
            : openAiLiveReadiness(options.env);
        if (readiness && !readiness.ready) {
            throw new InboundProcessingError(readiness.code, true);
        }
        await (options.orchestrator ?? runSalesOrchestrator)(tdb, {
            agencyId: event.agencyId,
            inboundEventId: event.id,
            conversationId: conversation.id,
            triggerMessageId,
        }, {
            executionMode: "NORMAL",
            copilot: options.copilot ??
                createOpenAiLiveCopilot(options.env),
        });
    }
}
