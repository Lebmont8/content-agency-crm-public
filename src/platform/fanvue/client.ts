import "server-only";
import type { PlatformAccountContext } from "@/platform/adapter";
import { FANVUE_API_VERSION, fanvueScopeProfileForCapabilities, isFanvueLiveSalesEnabled, validateFanvueScopes } from "@/platform/fanvue/oauth";
import { getFanvueAccessToken } from "@/platform/fanvue/token-manager";
const BASE_URL = "https://api.fanvue.com";
export class FanvueApiError extends Error {
    constructor(message: string, readonly status: number, readonly retryAfterSeconds: number | null = null) {
        super(message);
        this.name = "FanvueApiError";
    }
}
export class FanvueRequestViolation extends Error {
    readonly code = "FANVUE_REQUEST_VIOLATION";
    constructor(message: string) {
        super(message);
        this.name = "FanvueRequestViolation";
    }
}
export { FanvueRequestViolation as FanvueReadOnlyViolation };
function assertFanvueRequest(context: PlatformAccountContext, path: string, init: RequestInit): void {
    const method = (init.method ?? "GET").toUpperCase();
    if (context.platform !== "fanvue" ||
        !context.remoteAccountId ||
        !context.secretRef?.startsWith("dbenc:")) {
        throw new FanvueRequestViolation("Fanvue account context is not ready");
    }
    if (!path.startsWith("/") || path.startsWith("//")) {
        throw new FanvueRequestViolation("Fanvue API path is invalid");
    }
    if (method === "GET" || method === "HEAD") {
        if (init.body != null || !context.capabilities.includes("sync")) {
            throw new FanvueRequestViolation("Fanvue read capability is unavailable");
        }
        validateFanvueScopes(context.grantedScopes, fanvueScopeProfileForCapabilities(context.capabilities));
        return;
    }
    if (!isFanvueLiveSalesEnabled() ||
        method !== "POST" ||
        !/^\/chats\/[^/?]+\/message$/.test(path) ||
        init.body == null ||
        (!context.capabilities.includes("send_text") &&
            !context.capabilities.includes("send_ppv"))) {
        throw new FanvueRequestViolation("Fanvue write request is not allowed");
    }
    validateFanvueScopes(context.grantedScopes, "live_sales");
}
export async function fanvueRequest(context: PlatformAccountContext, path: string, init: RequestInit = {}, retriedAfterRefresh = false): Promise<unknown> {
    assertFanvueRequest(context, path, init);
    const accessToken = await getFanvueAccessToken(context, retriedAfterRefresh);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    headers.set("X-Fanvue-API-Version", FANVUE_API_VERSION);
    const response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401 && !retriedAfterRefresh) {
        return fanvueRequest(context, path, init, true);
    }
    if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        throw new FanvueApiError(`Fanvue API request failed (${response.status})`, response.status, retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null);
    }
    if (response.status === 204)
        return null;
    return response.json();
}
