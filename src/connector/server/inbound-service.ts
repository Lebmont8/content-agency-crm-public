import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import type { DesktopConnectorInboundMessage } from "@/connector/protocol";
import { DesktopConnectorError } from "@/connector/server/errors";
import { enqueueInboundEvent } from "@/inbound/enqueue";
import { assertPilotGate, PilotGateDeniedError } from "@/pilot/policy";
import { isLivePilotRuntimeReady } from "@/pilot/runtime";
export async function ingestDesktopConnectorInboundMessage(tdb: TenantDb, input: {
    agencyId: string;
    deviceId: string;
    message: DesktopConnectorInboundMessage;
}, options: {
    runtimeReady?: boolean;
} = {}): Promise<{
    eventId: string;
    duplicate: boolean;
}> {
    const profile = await tdb.desktopConnectorProfile.findUnique({
        where: { id: input.message.profileId },
        select: {
            deviceId: true,
            platform: true,
            status: true,
            connectionId: true,
            connection: {
                select: {
                    status: true,
                    grantedScopes: true,
                    capabilities: true,
                },
            },
            creatorAccount: {
                select: {
                    platform: true,
                    status: true,
                    activated: true,
                    aiAutoReply: true,
                    pilotMode: true,
                    complianceApprovedAt: true,
                    dailyAiRunLimit: true,
                    dailyAiCostLimitMicros: true,
                    agency: { select: { status: true, pilotEnabled: true } },
                },
            },
        },
    });
    if (!profile ||
        profile.deviceId !== input.deviceId ||
        profile.platform !== "fansly" ||
        profile.creatorAccount.platform !== "fansly" ||
        profile.status !== "READY" ||
        profile.connection.status !== "ACTIVE" ||
        !profile.connection.grantedScopes.includes("read:messages") ||
        !profile.connection.capabilities.includes("sync")) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_INBOUND_PROFILE_INVALID", 409, "Fansly desktop inbound profile is not ready");
    }
    try {
        assertPilotGate({
            runtimeEnabled: options.runtimeReady ?? isLivePilotRuntimeReady(),
            agency: profile.creatorAccount.agency,
            account: profile.creatorAccount,
        }, "LIVE_PLATFORM_READ");
    }
    catch (error) {
        if (error instanceof PilotGateDeniedError) {
            throw new DesktopConnectorError(error.code, 403, error.message);
        }
        throw error;
    }
    return enqueueInboundEvent(tdb, {
        agencyId: input.agencyId,
        connectionId: profile.connectionId,
        providerEventId: input.message.providerEventId,
        type: "fansly.message.received",
        payload: {
            profileId: input.message.profileId,
            externalMessageRef: input.message.externalMessageRef,
            externalFanRef: input.message.externalFanRef,
            body: input.message.body,
            sentAt: input.message.sentAt,
        },
        occurredAt: new Date(input.message.sentAt),
    });
}
