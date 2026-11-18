import type { TenantDb } from "@/lib/tenant-db";
import { getPlatformCapabilities } from "@/platform/registry";
export type SendOperation = "TEXT" | "PPV" | "AUTO_REPLY";
export type SendGuardCode = "AGENCY_SUSPENDED" | "ACCOUNT_PAUSED" | "ACCOUNT_DISCONNECTED" | "ACCOUNT_NOT_ACTIVATED" | "CONNECTION_UNAVAILABLE" | "CONNECTION_NOT_ACTIVE" | "CAPABILITY_UNAVAILABLE";
export type SendGuardDecision = {
    allowed: true;
} | {
    allowed: false;
    code: SendGuardCode;
    message: string;
};
type SendGuardInput = {
    agencyStatus: string;
    account: {
        status: string;
        activated: boolean;
        platform: string;
        connection: {
            status: string;
            capabilities: readonly string[];
        } | null;
    };
};
const DENIAL_MESSAGES: Record<SendGuardCode, string> = {
    AGENCY_SUSPENDED: "Agency access is suspended",
    ACCOUNT_PAUSED: "This account is paused",
    ACCOUNT_DISCONNECTED: "This account is disconnected",
    ACCOUNT_NOT_ACTIVATED: "This model is not activated yet",
    CONNECTION_UNAVAILABLE: "Platform connection is unavailable",
    CONNECTION_NOT_ACTIVE: "Platform connection is not active",
    CAPABILITY_UNAVAILABLE: "Sending is unavailable for this platform",
};
function deny(code: SendGuardCode): SendGuardDecision {
    return { allowed: false, code, message: DENIAL_MESSAGES[code] };
}
export function evaluateSendGuard(input: SendGuardInput, operation: SendOperation): SendGuardDecision {
    if (input.agencyStatus !== "ACTIVE")
        return deny("AGENCY_SUSPENDED");
    if (input.account.status === "PAUSED")
        return deny("ACCOUNT_PAUSED");
    if (input.account.status !== "ACTIVE")
        return deny("ACCOUNT_DISCONNECTED");
    if (!input.account.activated)
        return deny("ACCOUNT_NOT_ACTIVATED");
    if (!input.account.connection)
        return deny("CONNECTION_UNAVAILABLE");
    if (input.account.connection.status !== "ACTIVE") {
        return deny("CONNECTION_NOT_ACTIVE");
    }
    const capabilities = getPlatformCapabilities(input.account.platform, input.account.connection.status, input.account.connection.capabilities);
    const capabilityAllowed = operation === "TEXT"
        ? capabilities.canSendText
        : operation === "PPV"
            ? capabilities.canSendPpv
            : capabilities.canAutoReply;
    return capabilityAllowed ? { allowed: true } : deny("CAPABILITY_UNAVAILABLE");
}
export function queuedDeliveryCancellationArgs(creatorAccountId: string, reason: SendGuardCode, now = new Date()) {
    return {
        where: {
            creatorAccountId,
            status: { in: ["PENDING", "RETRY"] as Array<"PENDING" | "RETRY"> },
        },
        data: {
            status: "CANCELED" as const,
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: reason,
            lastErrorAt: now,
        },
    };
}
export async function cancelClaimedDelivery(tdb: TenantDb, deliveryId: string, leaseOwner: string, reason: string, now = new Date()): Promise<boolean> {
    const canceled = await tdb.outboundDelivery.updateMany({
        where: { id: deliveryId, status: "PROCESSING", leaseOwner },
        data: {
            status: "CANCELED",
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: reason,
            lastErrorAt: now,
        },
    });
    return canceled.count === 1;
}
