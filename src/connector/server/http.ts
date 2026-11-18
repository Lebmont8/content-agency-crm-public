import "server-only";
import { db } from "@/lib/db";
import { getTenantDb, type TenantDb } from "@/lib/tenant-db";
import { authenticateDesktopConnectorRequest } from "@/connector/server/request-auth";
import { recordDesktopConnectorRequest } from "@/connector/server/device-service";
import { DesktopConnectorError } from "@/connector/server/errors";
const MAX_CONNECTOR_BODY_BYTES = 64 * 1024;
export async function readDesktopConnectorJsonBody(request: Request): Promise<{
    raw: string;
    value: unknown;
}> {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_CONNECTOR_BODY_BYTES) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_BODY_TOO_LARGE", 413, "Desktop connector request body is too large");
    }
    try {
        return { raw, value: JSON.parse(raw) as unknown };
    }
    catch {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_BODY_INVALID", 400, "Desktop connector request body is invalid");
    }
}
export async function authenticateAndRecordDesktopConnectorRequest(request: Request, input: {
    path: string;
    kind: string;
}): Promise<{
    body: unknown;
    duplicate: boolean;
    deviceId: string;
    agencyId: string;
    requestId: string;
    tdb: TenantDb;
}> {
    const body = await readDesktopConnectorJsonBody(request);
    const authenticated = await authenticateDesktopConnectorRequest(db, {
        method: "POST",
        path: input.path,
        body: body.raw,
        headers: request.headers,
    });
    const tdb = getTenantDb(authenticated.device.agencyId);
    const receipt = await recordDesktopConnectorRequest(tdb, {
        agencyId: authenticated.device.agencyId,
        deviceId: authenticated.device.id,
        requestId: authenticated.request.requestId,
        kind: input.kind,
        requestDigest: authenticated.requestDigest,
    });
    return {
        body: body.value,
        duplicate: receipt.duplicate,
        deviceId: authenticated.device.id,
        agencyId: authenticated.device.agencyId,
        requestId: authenticated.request.requestId,
        tdb,
    };
}
