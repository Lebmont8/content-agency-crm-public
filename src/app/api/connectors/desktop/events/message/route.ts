import { desktopConnectorInboundMessageSchema } from "@/connector/protocol";
import { ingestDesktopConnectorInboundMessage } from "@/connector/server/inbound-service";
import { authenticateAndRecordDesktopConnectorRequest } from "@/connector/server/http";
import { connectorErrorResponse, DesktopConnectorError } from "@/connector/server/errors";
const PATH = "/api/connectors/desktop/events/message";
export async function POST(request: Request): Promise<Response> {
    try {
        const authenticated = await authenticateAndRecordDesktopConnectorRequest(request, {
            path: PATH,
            kind: "event.message",
        });
        const parsed = desktopConnectorInboundMessageSchema.safeParse(authenticated.body);
        if (!parsed.success) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_INBOUND_INVALID", 400);
        }
        const ingested = await ingestDesktopConnectorInboundMessage(authenticated.tdb, {
            agencyId: authenticated.agencyId,
            deviceId: authenticated.deviceId,
            message: parsed.data,
        });
        return Response.json({
            ok: true,
            duplicateRequest: authenticated.duplicate,
            duplicateEvent: ingested.duplicate,
            eventId: ingested.eventId,
        }, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return connectorErrorResponse(error);
    }
}
