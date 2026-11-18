import "server-only";
import crypto from "node:crypto";
import type { ControlMode, Prisma, SalesStage } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import { redactAuditMetadata, type AuditAction } from "@/domain/audit";
import { followUpCancellationArgs } from "@/followup/cancel";
export const HANDOFF_SLA_MS = 15 * 60 * 1000;
const TERMINAL_STAGES = new Set<SalesStage>([
    "HANDOFF",
    "PAUSED",
    "WON",
    "LOST",
]);
type ConversationSnapshot = {
    id: string;
    agencyId: string;
    creatorAccountId: string;
    controlMode: ControlMode;
    salesStage: SalesStage;
    handoffStatus: "REQUESTED" | "TAKEN_OVER" | null;
    handoffRequestId: string | null;
    handoffReason: string | null;
    handoffRequestedAt: Date | null;
    handoffSlaDueAt: Date | null;
    handoffRequestedByUserId: string | null;
    assignedUserId: string | null;
    takenOverAt: Date | null;
    resumeMode: ControlMode | null;
    resumeSalesStage: SalesStage | null;
};
export type HandoffWorkflowResult = {
    ok: true;
    duplicate: boolean;
    requestId: string;
    status: "REQUESTED" | "TAKEN_OVER" | "RESUMED";
} | {
    ok: false;
    code: "NOT_FOUND" | "CONFLICT";
};
function resumeModeFor(conversation: ConversationSnapshot): ControlMode {
    if (conversation.resumeMode && conversation.resumeMode !== "HUMAN") {
        return conversation.resumeMode;
    }
    return conversation.controlMode === "HUMAN" ? "ASSIST" : conversation.controlMode;
}
function resumeStageFor(conversation: ConversationSnapshot): SalesStage {
    if (conversation.resumeSalesStage &&
        !TERMINAL_STAGES.has(conversation.resumeSalesStage)) {
        return conversation.resumeSalesStage;
    }
    return TERMINAL_STAGES.has(conversation.salesStage)
        ? "DISCOVERY"
        : conversation.salesStage;
}
export function handoffStatePatch(conversation: ConversationSnapshot, input: {
    status: "REQUESTED" | "TAKEN_OVER";
    requestId: string;
    reason: string;
    requestedByUserId: string | null;
    assignedUserId: string | null;
    now: Date;
}) {
    const requestedAt = conversation.handoffRequestedAt ?? input.now;
    return {
        controlMode: "HUMAN" as const,
        salesStage: "HANDOFF" as const,
        handoffStatus: input.status,
        handoffRequestId: conversation.handoffRequestId ?? input.requestId,
        handoffReason: conversation.handoffReason ?? input.reason,
        handoffRequestedAt: requestedAt,
        handoffSlaDueAt: conversation.handoffSlaDueAt ??
            new Date(requestedAt.getTime() + HANDOFF_SLA_MS),
        handoffRequestedByUserId: conversation.handoffRequestedByUserId ?? input.requestedByUserId,
        assignedUserId: input.assignedUserId,
        takenOverAt: input.status === "TAKEN_OVER" ? input.now : null,
        resumeMode: resumeModeFor(conversation),
        resumeSalesStage: resumeStageFor(conversation),
        nextActionAt: null,
    };
}
export function resumeStatePatch(conversation: ConversationSnapshot, mode: Exclude<ControlMode, "HUMAN">) {
    return {
        controlMode: mode,
        salesStage: resumeStageFor(conversation),
        handoffStatus: null,
        handoffRequestId: null,
        handoffReason: null,
        handoffRequestedAt: null,
        handoffSlaDueAt: null,
        handoffRequestedByUserId: null,
        assignedUserId: null,
        takenOverAt: null,
        resumeMode: null,
        resumeSalesStage: null,
    };
}
async function getConversation(tdb: TenantDb, conversationId: string): Promise<ConversationSnapshot | null> {
    return tdb.conversation.findUnique({
        where: { id: conversationId },
        select: {
            id: true,
            agencyId: true,
            creatorAccountId: true,
            controlMode: true,
            salesStage: true,
            handoffStatus: true,
            handoffRequestId: true,
            handoffReason: true,
            handoffRequestedAt: true,
            handoffSlaDueAt: true,
            handoffRequestedByUserId: true,
            assignedUserId: true,
            takenOverAt: true,
            resumeMode: true,
            resumeSalesStage: true,
        },
    });
}
async function notificationRecipients(tdb: TenantDb, creatorAccountId: string, excludeUserId?: string | null): Promise<string[]> {
    const users = await tdb.user.findMany({
        where: {
            isActive: true,
            ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
            OR: [
                { role: "OWNER" },
                { assignments: { some: { creatorAccountId } } },
            ],
        },
        select: { id: true },
    });
    return users.map((user) => user.id);
}
function notificationRows(input: {
    agencyId: string;
    conversationId: string;
    requestId: string;
    type: "HANDOFF_REQUESTED" | "HANDOFF_TAKEN_OVER" | "HANDOFF_RESUMED";
    reason: string;
    recipientUserIds: string[];
}) {
    return input.recipientUserIds.map((recipientUserId) => ({
        agencyId: input.agencyId,
        recipientUserId,
        conversationId: input.conversationId,
        type: input.type,
        dedupeKey: `${input.type}:${input.requestId}:${recipientUserId}`,
        reason: input.reason,
    }));
}
function auditRow(input: {
    agencyId: string;
    actorId: string | null;
    action: AuditAction;
    conversationId: string;
    before: Prisma.InputJsonValue;
    after: Prisma.InputJsonValue;
}) {
    return {
        agencyId: input.agencyId,
        actorId: input.actorId,
        action: input.action,
        entityType: "Conversation",
        entityId: input.conversationId,
        before: redactAuditMetadata(input.before),
        after: redactAuditMetadata(input.after),
    };
}
function stopAutomationQueries(tdb: TenantDb, conversationId: string, now: Date) {
    return [
        tdb.followUpJob.updateMany(followUpCancellationArgs({ conversationId }, "HUMAN_HANDOFF", now)),
        tdb.outboundDelivery.updateMany({
            where: {
                conversationId,
                status: { in: ["PENDING", "RETRY"] },
                message: {
                    OR: [
                        { originAgentActionId: { not: null } },
                        { aiMode: "AUTO" },
                    ],
                },
            },
            data: {
                status: "CANCELED",
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: "HUMAN_TAKEOVER_ACTIVE",
                lastErrorAt: now,
            },
        }),
        tdb.agentAction.updateMany({
            where: {
                conversationId,
                kind: { in: ["SEND_TEXT", "SEND_PPV", "SCHEDULE_FOLLOW_UP"] },
                status: { in: ["PROPOSED", "APPROVED", "EXECUTING"] },
            },
            data: {
                status: "CANCELED",
                reasonCode: "HUMAN_TAKEOVER_ACTIVE",
                executedAt: now,
            },
        }),
    ];
}
export async function requestHumanHandoff(tdb: TenantDb, input: {
    agencyId: string;
    conversationId: string;
    reason: string;
    requestedByUserId?: string | null;
    requestId?: string;
    sourceAgentRunId?: string;
    sourceAgentActionId?: string;
    now?: Date;
}): Promise<HandoffWorkflowResult> {
    const conversation = await getConversation(tdb, input.conversationId);
    if (!conversation || conversation.agencyId !== input.agencyId) {
        return { ok: false, code: "NOT_FOUND" };
    }
    if (conversation.handoffStatus && conversation.handoffRequestId) {
        return {
            ok: true,
            duplicate: true,
            requestId: conversation.handoffRequestId,
            status: conversation.handoffStatus,
        };
    }
    const now = input.now ?? new Date();
    const requestId = input.requestId ?? crypto.randomUUID();
    const patch = handoffStatePatch(conversation, {
        status: "REQUESTED",
        requestId,
        reason: input.reason,
        requestedByUserId: input.requestedByUserId ?? null,
        assignedUserId: null,
        now,
    });
    const recipients = await notificationRecipients(tdb, conversation.creatorAccountId, input.requestedByUserId);
    const notifications = notificationRows({
        agencyId: input.agencyId,
        conversationId: conversation.id,
        requestId,
        type: "HANDOFF_REQUESTED",
        reason: input.reason,
        recipientUserIds: recipients,
    });
    const [updated] = await tdb.$transaction([
        tdb.conversation.updateMany({
            where: { id: conversation.id, handoffStatus: null },
            data: patch,
        }),
        ...stopAutomationQueries(tdb, conversation.id, now),
        ...(input.sourceAgentActionId
            ? [
                tdb.agentAction.updateMany({
                    where: {
                        id: input.sourceAgentActionId,
                        status: { in: ["APPROVED", "EXECUTING"] },
                    },
                    data: { status: "COMPLETED", executedAt: now, reasonCode: null },
                }),
            ]
            : []),
        ...(input.sourceAgentRunId
            ? [
                tdb.salesEvent.upsert({
                    where: {
                        agencyId_dedupeKey: {
                            agencyId: input.agencyId,
                            dedupeKey: `handoff:${requestId}`,
                        },
                    },
                    create: {
                        agencyId: input.agencyId,
                        conversationId: conversation.id,
                        agentRunId: input.sourceAgentRunId,
                        agentActionId: input.sourceAgentActionId,
                        type: "HANDOFF",
                        stageFrom: conversation.salesStage,
                        stageTo: "HANDOFF",
                        dedupeKey: `handoff:${requestId}`,
                        metadata: { reason: input.reason },
                        occurredAt: now,
                    },
                    update: {},
                }),
            ]
            : []),
        ...(notifications.length > 0
            ? [tdb.internalNotification.createMany({ data: notifications, skipDuplicates: true })]
            : []),
        tdb.auditLog.create({
            data: auditRow({
                agencyId: input.agencyId,
                actorId: input.requestedByUserId ?? null,
                action: "conversation.handoff.request",
                conversationId: conversation.id,
                before: {
                    controlMode: conversation.controlMode,
                    salesStage: conversation.salesStage,
                },
                after: {
                    requestId,
                    status: "REQUESTED",
                    reason: input.reason,
                    slaDueAt: patch.handoffSlaDueAt.toISOString(),
                },
            }),
        }),
    ]);
    if (updated.count !== 1) {
        const current = await getConversation(tdb, conversation.id);
        return current?.handoffRequestId && current.handoffStatus
            ? {
                ok: true,
                duplicate: true,
                requestId: current.handoffRequestId,
                status: current.handoffStatus,
            }
            : { ok: false, code: "CONFLICT" };
    }
    return { ok: true, duplicate: false, requestId, status: "REQUESTED" };
}
export async function takeOverConversation(tdb: TenantDb, input: {
    agencyId: string;
    conversationId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
}): Promise<HandoffWorkflowResult> {
    const conversation = await getConversation(tdb, input.conversationId);
    if (!conversation || conversation.agencyId !== input.agencyId) {
        return { ok: false, code: "NOT_FOUND" };
    }
    if (conversation.handoffStatus === "TAKEN_OVER") {
        return conversation.assignedUserId === input.actorUserId &&
            conversation.handoffRequestId
            ? {
                ok: true,
                duplicate: true,
                requestId: conversation.handoffRequestId,
                status: "TAKEN_OVER",
            }
            : { ok: false, code: "CONFLICT" };
    }
    const now = input.now ?? new Date();
    const requestId = conversation.handoffRequestId ?? crypto.randomUUID();
    const patch = handoffStatePatch(conversation, {
        status: "TAKEN_OVER",
        requestId,
        reason: input.reason,
        requestedByUserId: input.actorUserId,
        assignedUserId: input.actorUserId,
        now,
    });
    const recipients = await notificationRecipients(tdb, conversation.creatorAccountId, input.actorUserId);
    const notifications = notificationRows({
        agencyId: input.agencyId,
        conversationId: conversation.id,
        requestId,
        type: "HANDOFF_TAKEN_OVER",
        reason: input.reason,
        recipientUserIds: recipients,
    });
    const [updated] = await tdb.$transaction([
        tdb.conversation.updateMany({
            where: {
                id: conversation.id,
                handoffStatus: conversation.handoffStatus,
                assignedUserId: null,
            },
            data: patch,
        }),
        ...stopAutomationQueries(tdb, conversation.id, now),
        ...(notifications.length > 0
            ? [tdb.internalNotification.createMany({ data: notifications, skipDuplicates: true })]
            : []),
        tdb.auditLog.create({
            data: auditRow({
                agencyId: input.agencyId,
                actorId: input.actorUserId,
                action: "conversation.takeover",
                conversationId: conversation.id,
                before: {
                    status: conversation.handoffStatus,
                    assignedUserId: conversation.assignedUserId,
                },
                after: {
                    requestId,
                    status: "TAKEN_OVER",
                    assignedUserId: input.actorUserId,
                    reason: input.reason,
                },
            }),
        }),
    ]);
    return updated.count === 1
        ? { ok: true, duplicate: false, requestId, status: "TAKEN_OVER" }
        : { ok: false, code: "CONFLICT" };
}
export async function resumeConversation(tdb: TenantDb, input: {
    agencyId: string;
    conversationId: string;
    actorUserId: string;
    mode: "ASSIST" | "AUTO";
    reason: string;
    now?: Date;
}): Promise<HandoffWorkflowResult> {
    const conversation = await getConversation(tdb, input.conversationId);
    if (!conversation || conversation.agencyId !== input.agencyId) {
        return { ok: false, code: "NOT_FOUND" };
    }
    if (!conversation.handoffStatus || !conversation.handoffRequestId) {
        return { ok: false, code: "CONFLICT" };
    }
    const now = input.now ?? new Date();
    const requestId = conversation.handoffRequestId;
    const patch = resumeStatePatch(conversation, input.mode);
    const recipients = await notificationRecipients(tdb, conversation.creatorAccountId, input.actorUserId);
    const notifications = notificationRows({
        agencyId: input.agencyId,
        conversationId: conversation.id,
        requestId,
        type: "HANDOFF_RESUMED",
        reason: input.reason,
        recipientUserIds: recipients,
    });
    const [updated] = await tdb.$transaction([
        tdb.conversation.updateMany({
            where: {
                id: conversation.id,
                handoffRequestId: requestId,
                handoffStatus: { not: null },
            },
            data: patch,
        }),
        tdb.internalNotification.updateMany({
            where: { conversationId: conversation.id, readAt: null },
            data: { readAt: now },
        }),
        ...(notifications.length > 0
            ? [tdb.internalNotification.createMany({ data: notifications, skipDuplicates: true })]
            : []),
        tdb.auditLog.create({
            data: auditRow({
                agencyId: input.agencyId,
                actorId: input.actorUserId,
                action: "conversation.resume",
                conversationId: conversation.id,
                before: {
                    requestId,
                    status: conversation.handoffStatus,
                    assignedUserId: conversation.assignedUserId,
                },
                after: {
                    controlMode: input.mode,
                    salesStage: patch.salesStage,
                    reason: input.reason,
                },
            }),
        }),
    ]);
    return updated.count === 1
        ? { ok: true, duplicate: false, requestId, status: "RESUMED" }
        : { ok: false, code: "CONFLICT" };
}
