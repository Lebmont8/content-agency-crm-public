import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import { desktopConnectorSendTextSchema } from "@/connector/protocol";
import { DesktopConnectorError } from "@/connector/server/errors";
import { enqueueDesktopConnectorCommand } from "@/connector/server/command-service";
export async function dispatchDesktopTextDelivery(tdb: TenantDb, input: {
    agencyId: string;
    deliveryId: string;
    leaseOwner: string;
    now: Date;
}): Promise<{
    commandId: string;
    duplicate: boolean;
}> {
    const delivery = await tdb.outboundDelivery.findUnique({
        where: { id: input.deliveryId },
        select: {
            id: true,
            agencyId: true,
            creatorAccountId: true,
            connectionId: true,
            clientRequestId: true,
            kind: true,
            status: true,
            attemptCount: true,
            leaseOwner: true,
            fan: { select: { externalFanRef: true } },
            message: { select: { body: true, aiMode: true } },
            creatorAccount: {
                select: {
                    platform: true,
                    aiAutoReply: true,
                    connection: {
                        select: {
                            authMethod: true,
                            status: true,
                            capabilities: true,
                        },
                    },
                },
            },
        },
    });
    if (!delivery ||
        delivery.agencyId !== input.agencyId ||
        delivery.kind !== "TEXT" ||
        delivery.status !== "PROCESSING" ||
        delivery.leaseOwner !== input.leaseOwner ||
        delivery.creatorAccount.platform !== "fansly" ||
        delivery.creatorAccount.connection?.authMethod !==
            "FANSLY_MANAGEMENT_SESSION" ||
        delivery.creatorAccount.connection.status !== "ACTIVE") {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_TARGET_INVALID", 409, "Fansly text delivery is not ready for desktop dispatch");
    }
    const capabilities = new Set(delivery.creatorAccount.connection.capabilities);
    if (!capabilities.has("send_text") ||
        (delivery.message.aiMode === "AUTO" &&
            (!delivery.creatorAccount.aiAutoReply ||
                !capabilities.has("auto_reply")))) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_CAPABILITY_DENIED", 409, "Fansly text delivery capability is not verified");
    }
    const profile = await tdb.desktopConnectorProfile.findUnique({
        where: {
            agencyId_creatorAccountId: {
                agencyId: input.agencyId,
                creatorAccountId: delivery.creatorAccountId,
            },
        },
        select: {
            id: true,
            deviceId: true,
            connectionId: true,
            platform: true,
            status: true,
            device: { select: { status: true, revokedAt: true } },
        },
    });
    if (!profile ||
        profile.connectionId !== delivery.connectionId ||
        profile.platform !== "fansly" ||
        profile.status !== "READY" ||
        profile.device.status !== "ACTIVE" ||
        profile.device.revokedAt) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_PROFILE_UNAVAILABLE", 409, "Fansly desktop profile is not ready");
    }
    const outboundAttemptNumber = delivery.attemptCount + 1;
    desktopConnectorSendTextSchema.parse({
        outboundDeliveryId: delivery.id,
        outboundAttemptNumber,
        externalFanRef: delivery.fan.externalFanRef,
        body: delivery.message.body,
        clientRequestId: delivery.clientRequestId,
    });
    const queued = await enqueueDesktopConnectorCommand(tdb, {
        agencyId: input.agencyId,
        deviceId: profile.deviceId,
        profileId: profile.id,
        kind: "SEND_TEXT",
        idempotencyKey: `send-text:${delivery.id}:${outboundAttemptNumber}`,
        outboundDeliveryId: delivery.id,
        outboundAttemptNumber,
        now: input.now,
    });
    const command = await tdb.desktopConnectorCommand.findUnique({
        where: { id: queued.commandId },
        select: {
            outboundDeliveryId: true,
            outboundAttemptNumber: true,
            status: true,
        },
    });
    if (!command ||
        command.outboundDeliveryId !== delivery.id ||
        command.outboundAttemptNumber !== outboundAttemptNumber ||
        !["PENDING", "LEASED"].includes(command.status)) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_COMMAND_CONFLICT", 409, "Fansly desktop send command conflicts with prior state");
    }
    const transitioned = await tdb.outboundDelivery.updateMany({
        where: {
            id: delivery.id,
            status: "PROCESSING",
            attemptCount: delivery.attemptCount,
            leaseOwner: input.leaseOwner,
        },
        data: {
            status: "CONFIRMING",
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: null,
            lastErrorAt: null,
        },
    });
    if (transitioned.count !== 1) {
        if (!queued.duplicate) {
            await tdb.desktopConnectorCommand.updateMany({
                where: { id: queued.commandId, status: "PENDING" },
                data: {
                    status: "CANCELED",
                    lastErrorCode: "OUTBOUND_DELIVERY_LEASE_LOST",
                    completedAt: input.now,
                },
            });
        }
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_DISPATCH_CONFLICT", 409, "Fansly desktop send dispatch lost its outbound lease");
    }
    return queued;
}
