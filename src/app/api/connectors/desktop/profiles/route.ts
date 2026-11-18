import { requireRole } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { logAudit } from "@/domain/audit";
import { desktopConnectorProfileBindingSchema } from "@/connector/protocol";
import { bindDesktopConnectorProfile } from "@/connector/server/device-service";
import { connectorErrorResponse, DesktopConnectorError } from "@/connector/server/errors";
export async function POST(request: Request): Promise<Response> {
    try {
        const { user } = await requireRole("OWNER");
        const raw = await request.json().catch(() => null);
        const parsed = desktopConnectorProfileBindingSchema.safeParse(raw);
        if (!parsed.success) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_PROFILE_INVALID", 400);
        }
        const tdb = getTenantDb(user.agencyId);
        const binding = await bindDesktopConnectorProfile(tdb, {
            agencyId: user.agencyId,
            deviceId: parsed.data.deviceId,
            creatorAccountId: parsed.data.creatorAccountId,
        });
        if (!binding.duplicate) {
            await logAudit(tdb, user.agencyId, {
                actorId: user.id,
                action: "connector.profile.bound",
                entityType: "DesktopConnectorProfile",
                entityId: binding.profileId,
                after: {
                    deviceId: parsed.data.deviceId,
                    creatorAccountId: parsed.data.creatorAccountId,
                    status: "LOCKED",
                },
            });
        }
        return Response.json({ ok: true, ...binding }, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return connectorErrorResponse(error);
    }
}
