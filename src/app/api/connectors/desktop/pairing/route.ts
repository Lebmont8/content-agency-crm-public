import { requireRole } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { logAudit } from "@/domain/audit";
import { desktopConnectorPairingIssueSchema } from "@/connector/protocol";
import { issueDesktopConnectorPairing } from "@/connector/server/device-service";
import { connectorErrorResponse, DesktopConnectorError } from "@/connector/server/errors";
export async function POST(request: Request): Promise<Response> {
    try {
        const { user } = await requireRole("OWNER");
        const raw = await request.json().catch(() => ({}));
        const parsed = desktopConnectorPairingIssueSchema.safeParse(raw);
        if (!parsed.success) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_PAIRING_INVALID", 400);
        }
        const tdb = getTenantDb(user.agencyId);
        const pairing = await issueDesktopConnectorPairing(tdb, {
            agencyId: user.agencyId,
            pairedByUserId: user.id,
            label: parsed.data.label,
        });
        await logAudit(tdb, user.agencyId, {
            actorId: user.id,
            action: "connector.device.pairing_created",
            entityType: "DesktopConnectorDevice",
            entityId: pairing.deviceId,
            after: {
                status: "PAIRING",
                expiresAt: pairing.expiresAt.toISOString(),
            },
        });
        return Response.json({
            ok: true,
            deviceId: pairing.deviceId,
            pairingCode: pairing.pairingCode,
            expiresAt: pairing.expiresAt.toISOString(),
        }, { headers: { "cache-control": "no-store" } });
    }
    catch (error) {
        return connectorErrorResponse(error);
    }
}
