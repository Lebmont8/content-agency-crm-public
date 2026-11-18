import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import type { SendResult } from "@/platform/adapter";
import { buildNextFollowUp } from "@/followup/schedule";
import { decideFailure, safeErrorCode } from "@/outbox/policy";
const RESULT_LEASE_MS = 30000;
export async function claimConfirmingDeliveryResult(tdb: TenantDb, input: {
    deliveryId: string;
    attemptNumber: number;
    leaseOwner: string;
    now: Date;
}): Promise<boolean> {
    const claimed = await tdb.outboundDelivery.updateMany({
        where: {
            id: input.deliveryId,
            status: "CONFIRMING",
            attemptCount: input.attemptNumber - 1,
            leaseOwner: null,
        },
        data: {
            status: "PROCESSING",
            leaseOwner: input.leaseOwner,
            leaseUntil: new Date(input.now.getTime() + RESULT_LEASE_MS),
        },
    });
    return claimed.count === 1;
}
export async function settleOutboundDeliveryAttempt(tdb: TenantDb, input: {
    agencyId: string;
    deliveryId: string;
    attemptNumber: number;
    leaseOwner: string;
    startedAt: Date;
    finishedAt: Date;
    result: SendResult;
}): Promise<boolean> {
    const delivery = await tdb.outboundDelivery.findUnique({
        where: { id: input.deliveryId },
        include: {
            message: {
                include: {
                    originAgentAction: {
                        include: {
                            agentRun: { select: { decision: true } },
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
            creatorAccount: { include: { salesProfile: true } },
        },
    });
    if (!delivery ||
        delivery.agencyId !== input.agencyId ||
        delivery.attemptCount + 1 !== input.attemptNumber) {
        return false;
    }
    const originAction = delivery.message.originAgentAction;
    if (input.result.ok) {
        const sentAt = input.result.sentAt ?? input.finishedAt;
        const followUp = originAction
            ? buildNextFollowUp({
                agencyId: input.agencyId,
                creatorAccountId: delivery.creatorAccountId,
                conversationId: delivery.conversationId,
                sourceAgentRunId: originAction.followUpExecutionJob?.sourceAgentRunId ??
                    originAction.agentRunId,
                sourceAgentActionId: originAction.followUpExecutionJob?.sourceAgentActionId ??
                    originAction.id,
                previousSequence: originAction.followUpExecutionJob?.sequence ?? 0,
                sentAt,
                profile: delivery.creatorAccount.salesProfile,
            })
            : null;
        await tdb.$transaction([
            tdb.outboundDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: "SENT",
                    attemptCount: input.attemptNumber,
                    providerExternalRef: input.result.externalRef ?? null,
                    sentAt,
                    leaseOwner: null,
                    leaseUntil: null,
                    lastErrorCode: null,
                    lastErrorAt: null,
                },
            }),
            tdb.message.update({
                where: { id: delivery.messageId },
                data: { externalRef: input.result.externalRef ?? null, sentAt },
            }),
            ...(delivery.vaultSendId
                ? [
                    tdb.vaultSend.update({
                        where: { id: delivery.vaultSendId },
                        data: { sentAt },
                    }),
                ]
                : []),
            tdb.conversation.update({
                where: { id: delivery.conversationId },
                data: { lastMessageAt: sentAt, unreadCount: 0 },
            }),
            tdb.outboundDeliveryAttempt.create({
                data: {
                    agencyId: input.agencyId,
                    deliveryId: delivery.id,
                    number: input.attemptNumber,
                    outcome: "SENT",
                    startedAt: input.startedAt,
                    finishedAt: input.finishedAt,
                },
            }),
            ...(originAction
                ? [
                    tdb.agentAction.updateMany({
                        where: { id: originAction.id, status: "EXECUTING" },
                        data: { status: "COMPLETED", reasonCode: null, executedAt: sentAt },
                    }),
                ]
                : []),
            ...(followUp
                ? [
                    tdb.followUpJob.updateMany({
                        where: {
                            conversationId: delivery.conversationId,
                            status: { in: ["PENDING", "PROCESSING", "RETRY"] },
                            dedupeKey: { not: followUp.dedupeKey },
                        },
                        data: {
                            status: "CANCELED",
                            cancelReason: "SUPERSEDED",
                            canceledAt: sentAt,
                            leaseOwner: null,
                            leaseUntil: null,
                        },
                    }),
                    tdb.followUpJob.upsert({
                        where: {
                            agencyId_dedupeKey: {
                                agencyId: input.agencyId,
                                dedupeKey: followUp.dedupeKey,
                            },
                        },
                        create: followUp,
                        update: {},
                    }),
                ]
                : []),
        ]);
        return true;
    }
    const failureKind = input.result.failureKind ?? "AMBIGUOUS";
    const decision = decideFailure({
        kind: failureKind,
        attemptNumber: input.attemptNumber,
        maxAttempts: delivery.maxAttempts,
        now: input.finishedAt,
        retryAfterSeconds: input.result.retryAfterSeconds,
    });
    const errorCode = safeErrorCode(input.result.errorCode, "DELIVERY_FAILED");
    await tdb.$transaction([
        tdb.outboundDelivery.update({
            where: { id: delivery.id },
            data: {
                status: decision.status,
                attemptCount: input.attemptNumber,
                nextAttemptAt: decision.nextAttemptAt,
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: errorCode,
                lastErrorAt: input.finishedAt,
            },
        }),
        tdb.outboundDeliveryAttempt.create({
            data: {
                agencyId: input.agencyId,
                deliveryId: delivery.id,
                number: input.attemptNumber,
                outcome: failureKind === "RETRYABLE"
                    ? "RETRYABLE"
                    : failureKind === "PERMANENT"
                        ? "PERMANENT"
                        : "AMBIGUOUS",
                errorCode,
                httpStatus: input.result.httpStatus,
                startedAt: input.startedAt,
                finishedAt: input.finishedAt,
            },
        }),
        ...(originAction && ["FAILED", "DLQ"].includes(decision.status)
            ? [
                tdb.agentAction.updateMany({
                    where: { id: originAction.id, status: "EXECUTING" },
                    data: {
                        status: "FAILED",
                        reasonCode: errorCode,
                        executedAt: input.finishedAt,
                    },
                }),
            ]
            : []),
    ]);
    return false;
}
