import { desktopConnectorCommandResultSchema } from "@/connector/protocol";
import { completeDesktopConnectorCommand } from "@/connector/server/command-service";
import { authenticateAndRecordDesktopConnectorRequest } from "@/connector/server/http";
import { connectorErrorResponse, DesktopConnectorError } from "@/connector/server/errors";
const PATH = "/api/connectors/desktop/commands/result";
export async function POST(request: Request): Promise<Response> {
    try {
        const authenticated = await authenticateAndRecordDesktopConnectorRequest(request, {
            path: PATH,
            kind: "command.result",
        });
        const parsed = desktopConnectorCommandResultSchema.safeParse(authenticated.body);
        if (!parsed.success) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_RESULT_INVALID", 400);
        }
        const completed = await completeDesktopConnectorCommand(authenticated.tdb, {
            deviceId: authenticated.deviceId,
            result: parsed.data,
        });
        return Response.json({
            ok: true,
            duplicate: authenticated.duplicate || completed.duplicate,
        }, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return connectorErrorResponse(error);
    }
}
