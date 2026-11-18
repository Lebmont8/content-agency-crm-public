import { getTenantDb } from "@/lib/tenant-db";
import { logAudit } from "@/domain/audit";
import { DESKTOP_CONNECTOR_HEARTBEAT_SECONDS, DESKTOP_CONNECTOR_PROTOCOL_VERSION } from "@/connector/protocol";
import { claimPendingDesktopConnectorPairing } from "@/connector/server/device-service";
import { readDesktopConnectorJsonBody } from "@/connector/server/http";
import { connectorErrorResponse } from "@/connector/server/errors";
export async function POST(request: Request): Promise<Response> {
    try {
        const body = await readDesktopConnectorJsonBody(request);
        const paired = await claimPendingDesktopConnectorPairing(body.value);
        const tdb = getTenantDb(paired.agencyId);
        await logAudit(tdb, paired.agencyId, {
            actorId: paired.pairedByUserId,
            action: "connector.device.paired",
            entityType: "DesktopConnectorDevice",
            entityId: paired.deviceId,
            after: {
                status: "ACTIVE",
                protocolVersion: DESKTOP_CONNECTOR_PROTOCOL_VERSION,
            },
        });
        return Response.json({
            ok: true,
            deviceId: paired.deviceId,
            deviceToken: paired.deviceToken,
            protocolVersion: DESKTOP_CONNECTOR_PROTOCOL_VERSION,
            heartbeatIntervalSeconds: DESKTOP_CONNECTOR_HEARTBEAT_SECONDS,
        }, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return connectorErrorResponse(error);
    }
}
