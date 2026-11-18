import { DESKTOP_CONNECTOR_HEARTBEAT_SECONDS, desktopConnectorHeartbeatSchema } from "@/connector/protocol";
import { recordDesktopConnectorHeartbeat } from "@/connector/server/device-service";
import { authenticateAndRecordDesktopConnectorRequest } from "@/connector/server/http";
import { connectorErrorResponse, DesktopConnectorError } from "@/connector/server/errors";
const PATH = "/api/connectors/desktop/heartbeat";
export async function POST(request: Request): Promise<Response> {
    try {
        const authenticated = await authenticateAndRecordDesktopConnectorRequest(request, {
            path: PATH,
            kind: "heartbeat",
        });
        const heartbeat = desktopConnectorHeartbeatSchema.safeParse(authenticated.body);
        if (!heartbeat.success) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_HEARTBEAT_INVALID", 400);
        }
        await recordDesktopConnectorHeartbeat(authenticated.tdb, {
            deviceId: authenticated.deviceId,
            heartbeat: heartbeat.data,
        });
        return Response.json({
            ok: true,
            duplicate: authenticated.duplicate,
            heartbeatIntervalSeconds: DESKTOP_CONNECTOR_HEARTBEAT_SECONDS,
            serverTime: new Date().toISOString(),
        }, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return connectorErrorResponse(error);
    }
}
