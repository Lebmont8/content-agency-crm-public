import { desktopConnectorSnapshotPageSchema } from "@/connector/snapshot";
import { ingestDesktopConnectorSnapshotPage } from "@/connector/server/snapshot-service";
import { authenticateAndRecordDesktopConnectorRequest } from "@/connector/server/http";
import { connectorErrorResponse, DesktopConnectorError } from "@/connector/server/errors";
const PATH = "/api/connectors/desktop/snapshots/page";
export async function POST(request: Request): Promise<Response> {
    try {
        const authenticated = await authenticateAndRecordDesktopConnectorRequest(request, {
            path: PATH,
            kind: "snapshot.page",
        });
        const parsed = desktopConnectorSnapshotPageSchema.safeParse(authenticated.body);
        if (!parsed.success) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_INVALID", 400);
        }
        const ingested = await ingestDesktopConnectorSnapshotPage(authenticated.tdb, {
            agencyId: authenticated.agencyId,
            deviceId: authenticated.deviceId,
            page: parsed.data,
        });
        return Response.json({
            ok: true,
            duplicateRequest: authenticated.duplicate,
            resource: ingested.resource,
            itemCount: ingested.itemCount,
        }, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return connectorErrorResponse(error);
    }
}
