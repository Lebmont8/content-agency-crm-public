import type { TenantDb } from "@/lib/tenant-db";
export type FollowUpCancelReason = "NEW_INBOUND" | "PURCHASE_CONFIRMED" | "FAN_OPT_OUT" | "HUMAN_HANDOFF" | "CONVERSATION_PAUSED" | "ACCOUNT_PAUSED" | "ACCOUNT_DISCONNECTED" | "SUPERSEDED" | "FOLLOW_UP_LIMIT_REACHED" | "FOLLOW_UP_POLICY_DENIED";
const ACTIVE_STATUSES = ["PENDING", "PROCESSING", "RETRY"] as const;
export function followUpCancellationArgs(where: {
    conversationId?: string;
    creatorAccountId?: string;
}, reason: FollowUpCancelReason, now = new Date()) {
    return {
        where: { ...where, status: { in: [...ACTIVE_STATUSES] } },
        data: {
            status: "CANCELED" as const,
            cancelReason: reason,
            canceledAt: now,
            leaseOwner: null,
            leaseUntil: null,
        },
    };
}
export async function cancelConversationFollowUps(tdb: TenantDb, conversationId: string, reason: FollowUpCancelReason, now = new Date()): Promise<number> {
    const jobs = await tdb.followUpJob.findMany({
        where: { conversationId },
        select: { agentActionId: true },
    });
    const actionIds = jobs.flatMap((job) => job.agentActionId ? [job.agentActionId] : []);
    const [canceledJobs, canceledDeliveries] = await tdb.$transaction([
        tdb.followUpJob.updateMany(followUpCancellationArgs({ conversationId }, reason, now)),
        tdb.outboundDelivery.updateMany({
            where: {
                conversationId,
                status: { in: ["PENDING", "RETRY"] },
                message: { originAgentActionId: { in: actionIds } },
            },
            data: {
                status: "CANCELED",
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: reason,
                lastErrorAt: now,
            },
        }),
    ]);
    return canceledJobs.count + canceledDeliveries.count;
}
export async function cancelAccountFollowUps(tdb: TenantDb, creatorAccountId: string, reason: "ACCOUNT_PAUSED" | "ACCOUNT_DISCONNECTED", now = new Date()): Promise<number> {
    const jobs = await tdb.followUpJob.findMany({
        where: { creatorAccountId },
        select: { agentActionId: true },
    });
    const actionIds = jobs.flatMap((job) => job.agentActionId ? [job.agentActionId] : []);
    const [canceledJobs, canceledDeliveries] = await tdb.$transaction([
        tdb.followUpJob.updateMany(followUpCancellationArgs({ creatorAccountId }, reason, now)),
        tdb.outboundDelivery.updateMany({
            where: {
                creatorAccountId,
                status: { in: ["PENDING", "RETRY"] },
                message: { originAgentActionId: { in: actionIds } },
            },
            data: {
                status: "CANCELED",
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: reason,
                lastErrorAt: now,
            },
        }),
    ]);
    return canceledJobs.count + canceledDeliveries.count;
}
