import "server-only";
export class DesktopConnectorError extends Error {
    constructor(readonly code: string, readonly status: number, message = code) {
        super(message);
        this.name = "DesktopConnectorError";
    }
}
export function connectorErrorResponse(error: unknown): Response {
    if (error &&
        typeof error === "object" &&
        "digest" in error &&
        typeof error.digest === "string" &&
        (error.digest.startsWith("NEXT_REDIRECT") ||
            error.digest.startsWith("NEXT_NOT_FOUND"))) {
        throw error;
    }
    const known = error instanceof DesktopConnectorError
        ? error
        : new DesktopConnectorError("DESKTOP_CONNECTOR_REQUEST_FAILED", 500, "Desktop connector request failed");
    return Response.json({ ok: false, error: known.code }, {
        status: known.status,
        headers: { "cache-control": "no-store" },
    });
}
