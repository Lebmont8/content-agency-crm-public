import { desktopConnectorPollSchema } from "@/connector/protocol";
import { claimDesktopConnectorCommand } from "@/connector/server/command-service";
import { authenticateAndRecordDesktopConnectorRequest } from "@/connector/server/http";
import { connectorErrorResponse, DesktopConnectorError } from "@/connector/server/errors";
const PATH = "/api/connectors/desktop/commands/poll";
export async function POST(request: Request): Promise<Response> {
    try {
        const authenticated = await authenticateAndRecordDesktopConnectorRequest(request, {
            path: PATH,
            kind: "command.poll",
        });
        const parsed = desktopConnectorPollSchema.safeParse(authenticated.body);
        if (!parsed.success) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_POLL_INVALID", 400);
        }
        const command = await claimDesktopConnectorCommand(authenticated.tdb, {
            deviceId: authenticated.deviceId,
            deliveryId: authenticated.requestId,
            allowNewClaim: !authenticated.duplicate,
        });
        return Response.json({
            ok: true,
            duplicate: authenticated.duplicate,
            command,
        }, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return connectorErrorResponse(error);
    }
}
