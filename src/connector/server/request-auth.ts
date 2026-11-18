import "server-only";
import { z } from "zod";
import { hashOpaqueToken } from "@/lib/auth-token";
import { DESKTOP_CONNECTOR_MAX_CLOCK_SKEW_MS, desktopConnectorRequestDigest, verifyDesktopConnectorSignature, type DesktopConnectorCanonicalRequest } from "@/connector/protocol";
import { DesktopConnectorError } from "@/connector/server/errors";
type ActiveDesktopConnectorDevice = {
    id: string;
    agencyId: string;
    status: string;
    tokenHash: string | null;
    publicKeySpki: string | null;
    revokedAt: Date | null;
};
type DesktopConnectorAuthDatabase = {
    desktopConnectorDevice: {
        findUnique(args: unknown): Promise<ActiveDesktopConnectorDevice | null>;
    };
};
export type AuthenticatedDesktopConnectorRequest = {
    device: ActiveDesktopConnectorDevice & {
        status: "ACTIVE";
        tokenHash: string;
        publicKeySpki: string;
    };
    request: DesktopConnectorCanonicalRequest;
    requestDigest: string;
};
const requestIdSchema = z.string().uuid();
const deviceIdSchema = z.string().min(1).max(128);
const signatureSchema = z.string().regex(/^[A-Za-z0-9_-]{64,256}$/);
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
function authFailure(): DesktopConnectorError {
    return new DesktopConnectorError("DESKTOP_CONNECTOR_AUTH_FAILED", 401, "Desktop connector authentication failed");
}
export async function authenticateDesktopConnectorRequest(database: DesktopConnectorAuthDatabase, input: {
    method: "POST";
    path: string;
    body: string;
    headers: Headers;
    now?: Date;
}): Promise<AuthenticatedDesktopConnectorRequest> {
    const authorization = input.headers.get("authorization");
    const deviceId = deviceIdSchema.safeParse(input.headers.get("x-connector-device-id"));
    const requestId = requestIdSchema.safeParse(input.headers.get("x-connector-request-id"));
    const signature = signatureSchema.safeParse(input.headers.get("x-connector-signature"));
    const timestampRaw = input.headers.get("x-connector-timestamp");
    const match = authorization?.match(/^Connector ([A-Za-z0-9_-]+)$/);
    const token = tokenSchema.safeParse(match?.[1]);
    const timestamp = timestampRaw === null ? Number.NaN : Number(timestampRaw);
    if (!deviceId.success ||
        !requestId.success ||
        !signature.success ||
        !token.success ||
        !Number.isSafeInteger(timestamp)) {
        throw authFailure();
    }
    const now = input.now ?? new Date();
    if (Math.abs(now.getTime() - timestamp) >
        DESKTOP_CONNECTOR_MAX_CLOCK_SKEW_MS) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_REQUEST_EXPIRED", 401, "Desktop connector request is outside the replay window");
    }
    const device = await database.desktopConnectorDevice.findUnique({
        where: { tokenHash: hashOpaqueToken(token.data) },
        select: {
            id: true,
            agencyId: true,
            status: true,
            tokenHash: true,
            publicKeySpki: true,
            revokedAt: true,
        },
    });
    if (!device ||
        device.id !== deviceId.data ||
        device.status !== "ACTIVE" ||
        device.revokedAt ||
        !device.tokenHash ||
        !device.publicKeySpki) {
        throw authFailure();
    }
    const request: DesktopConnectorCanonicalRequest = {
        method: input.method,
        path: input.path,
        deviceId: deviceId.data,
        requestId: requestId.data,
        timestamp,
        body: input.body,
    };
    if (!verifyDesktopConnectorSignature(request, signature.data, device.publicKeySpki)) {
        throw authFailure();
    }
    return {
        device: device as AuthenticatedDesktopConnectorRequest["device"],
        request,
        requestDigest: desktopConnectorRequestDigest(request),
    };
}
