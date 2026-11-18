import { requireRole } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { logAudit } from "@/domain/audit";
import { revokeDesktopConnectorDevice } from "@/connector/server/device-service";
import { connectorErrorResponse } from "@/connector/server/errors";
export async function POST(_request: Request, context: {
    params: Promise<{
        deviceId: string;
    }>;
}): Promise<Response> {
    try {
        const { user } = await requireRole("OWNER");
        const { deviceId } = await context.params;
        const tdb = getTenantDb(user.agencyId);
        const revoked = await revokeDesktopConnectorDevice(tdb, deviceId);
        if (revoked) {
            await logAudit(tdb, user.agencyId, {
                actorId: user.id,
                action: "connector.device.revoked",
                entityType: "DesktopConnectorDevice",
                entityId: deviceId,
                after: { status: "REVOKED" },
            });
        }
        return Response.json({ ok: true, revoked }, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return connectorErrorResponse(error);
    }
}
