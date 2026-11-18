const STATE_KEY = "content-agency-crm-health-v1";
const HEALTH_ENDPOINTS = [
    {
        name: "live",
        path: "/api/health/live",
        expectedStatus: "ok",
    },
    {
        name: "ready",
        path: "/api/health/ready",
        expectedStatus: "ready",
    },
] as const;
export type MonitorStatus = "healthy" | "unhealthy";
export type MonitorNotification = "failure" | "recovery" | null;
export interface MonitorStateStore {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
}
export interface MonitorEnvironment {
    CRM_BASE_URL: string;
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_CHAT_ID: string;
    MONITOR_STATE: MonitorStateStore;
}
export interface EndpointResult {
    name: (typeof HEALTH_ENDPOINTS)[number]["name"];
    ok: boolean;
    statusCode: number | null;
    observedStatus: string;
    exceptionType: string | null;
    exceptionCode: string | null;
    exceptionCategory: string | null;
}
export interface MonitorCycleResult {
    status: MonitorStatus;
    notification: MonitorNotification;
    checkedAt: string;
    endpoints: EndpointResult[];
}
export type MonitorFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
interface StoredMonitorState {
    version: 1;
    status: MonitorStatus;
    changedAt: string;
}
const DIAGNOSTIC_EVENT = "vexora_crm_monitor_probe_v1";
function safeDiagnosticMarker(value: unknown, fallback: string, maxLength = 64): string {
    if (typeof value !== "string" && typeof value !== "number") {
        return fallback;
    }
    const marker = String(value)
        .replace(/[^A-Za-z0-9_.:-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, maxLength);
    return marker || fallback;
}
function classifyException(error: unknown): {
    exceptionType: string;
    exceptionCode: string;
    exceptionCategory: string;
} {
    const candidate = error && typeof error === "object"
        ? (error as {
            name?: unknown;
            message?: unknown;
            code?: unknown;
            cause?: {
                code?: unknown;
                message?: unknown;
            };
        })
        : {};
    const message = [candidate.message, candidate.cause?.message]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase();
    let exceptionCategory = "unclassified";
    if (/abort|timed?\s*out|timeout/.test(message)) {
        exceptionCategory = "timeout";
    }
    else if (/redirect/.test(message)) {
        exceptionCategory = "redirect_rejected";
    }
    else if (/dns|resolve|name resolution/.test(message)) {
        exceptionCategory = "dns_failure";
    }
    else if (/certificate|\btls\b|\bssl\b/.test(message)) {
        exceptionCategory = "tls_failure";
    }
    else if (/connection refused|econnrefused/.test(message)) {
        exceptionCategory = "connection_refused";
    }
    else if (/network connection lost/.test(message)) {
        exceptionCategory = "network_connection_lost";
    }
    else if (/subrequest/.test(message)) {
        exceptionCategory = "subrequest_failure";
    }
    else if (/fetch failed|network|connection/.test(message)) {
        exceptionCategory = "fetch_failure";
    }
    return {
        exceptionType: safeDiagnosticMarker(candidate.name, "unknown_error"),
        exceptionCode: safeDiagnosticMarker(candidate.code ?? candidate.cause?.code, "none"),
        exceptionCategory,
    };
}
function emitProbeDiagnostic(checkedAt: string, status: MonitorStatus, endpoints: EndpointResult[], logger: (line: string) => void): void {
    const record = {
        event: DIAGNOSTIC_EVENT,
        checkedAt,
        status,
        endpoints: endpoints.map((endpoint) => ({
            name: endpoint.name,
            ok: endpoint.ok,
            statusCode: endpoint.statusCode,
            observedStatus: endpoint.observedStatus,
            exceptionType: endpoint.exceptionType,
            exceptionCode: endpoint.exceptionCode,
            exceptionCategory: endpoint.exceptionCategory,
        })),
    };
    try {
        logger(JSON.stringify(record));
    }
    catch {
    }
}
function requireValue(value: string | undefined, key: string): string {
    if (!value?.trim()) {
        throw new Error("Missing monitor configuration: " + key);
    }
    return value.trim();
}
function normalizeBaseUrl(rawValue: string): URL {
    const url = new URL(requireValue(rawValue, "CRM_BASE_URL"));
    if (url.protocol !== "https:") {
        throw new Error("CRM_BASE_URL must use HTTPS");
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new Error("CRM_BASE_URL must not contain credentials, query, or hash");
    }
    url.pathname = "/";
    return url;
}
function parseStoredState(rawState: string | null): StoredMonitorState | null {
    if (!rawState)
        return null;
    try {
        const candidate = JSON.parse(rawState) as Partial<StoredMonitorState>;
        if (candidate.version === 1 &&
            (candidate.status === "healthy" || candidate.status === "unhealthy") &&
            typeof candidate.changedAt === "string") {
            return candidate as StoredMonitorState;
        }
    }
    catch {
        return null;
    }
    return null;
}
async function checkEndpoint(baseUrl: URL, endpoint: (typeof HEALTH_ENDPOINTS)[number], fetchImpl: MonitorFetch): Promise<EndpointResult> {
    const url = new URL(endpoint.path, baseUrl);
    try {
        const response = await fetchImpl(url, {
            cache: "no-store",
            headers: { accept: "application/json" },
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
        });
        if (response.status >= 300 && response.status <= 399) {
            return {
                name: endpoint.name,
                ok: false,
                statusCode: response.status,
                observedStatus: "redirect",
                exceptionType: null,
                exceptionCode: null,
                exceptionCategory: null,
            };
        }
        let observedStatus = "invalid-json";
        try {
            const payload = (await response.json()) as {
                status?: unknown;
            };
            if (payload.status === endpoint.expectedStatus) {
                observedStatus = endpoint.expectedStatus;
            }
            else if (typeof payload.status === "string") {
                observedStatus = "unexpected-status";
            }
        }
        catch {
        }
        return {
            name: endpoint.name,
            ok: response.ok && observedStatus === endpoint.expectedStatus,
            statusCode: response.status,
            observedStatus,
            exceptionType: null,
            exceptionCode: null,
            exceptionCategory: null,
        };
    }
    catch (error) {
        const exception = classifyException(error);
        return {
            name: endpoint.name,
            ok: false,
            statusCode: null,
            observedStatus: "request-error",
            ...exception,
        };
    }
}
function renderEndpoint(result: EndpointResult): string {
    const statusCode = result.statusCode === null ? "network" : result.statusCode;
    return result.name + ": " + statusCode + "/" + result.observedStatus;
}
function buildNotificationText(notification: Exclude<MonitorNotification, null>, checkedAt: string, endpoints: EndpointResult[]): string {
    const heading = notification === "failure"
        ? "🚨 Vexora CRM health check failed"
        : "✅ Vexora CRM health restored";
    return [
        heading,
        ...endpoints.map(renderEndpoint),
        "checked_at: " + checkedAt,
    ].join("\n");
}
async function sendTelegramNotification(env: MonitorEnvironment, text: string, fetchImpl: MonitorFetch): Promise<void> {
    const botToken = requireValue(env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
    const chatId = requireValue(env.TELEGRAM_CHAT_ID, "TELEGRAM_CHAT_ID");
    const response = await fetchImpl("https://api.telegram.org/bot" + botToken + "/sendMessage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
    });
    let accepted = false;
    try {
        const payload = (await response.json()) as {
            ok?: unknown;
        };
        accepted = payload.ok === true;
    }
    catch {
        accepted = false;
    }
    if (!response.ok || !accepted) {
        throw new Error("Telegram monitor notification was not accepted");
    }
}
export async function runMonitorCycle(env: MonitorEnvironment, options: {
    fetchImpl?: MonitorFetch;
    now?: () => Date;
    logger?: (line: string) => void;
} = {}): Promise<MonitorCycleResult> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const checkedAt = (options.now ?? (() => new Date()))().toISOString();
    const baseUrl = normalizeBaseUrl(env.CRM_BASE_URL);
    requireValue(env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
    requireValue(env.TELEGRAM_CHAT_ID, "TELEGRAM_CHAT_ID");
    if (!env.MONITOR_STATE) {
        throw new Error("Missing monitor configuration: MONITOR_STATE");
    }
    const endpoints = await Promise.all(HEALTH_ENDPOINTS.map((endpoint) => checkEndpoint(baseUrl, endpoint, fetchImpl)));
    const status: MonitorStatus = endpoints.every((endpoint) => endpoint.ok)
        ? "healthy"
        : "unhealthy";
    emitProbeDiagnostic(checkedAt, status, endpoints, options.logger ?? console.log);
    const previousState = parseStoredState(await env.MONITOR_STATE.get(STATE_KEY));
    let notification: MonitorNotification = null;
    if (previousState?.status !== status) {
        if (status === "unhealthy") {
            notification = "failure";
        }
        else if (previousState?.status === "unhealthy") {
            notification = "recovery";
        }
        if (notification) {
            await sendTelegramNotification(env, buildNotificationText(notification, checkedAt, endpoints), fetchImpl);
        }
        const nextState: StoredMonitorState = {
            version: 1,
            status,
            changedAt: checkedAt,
        };
        await env.MONITOR_STATE.put(STATE_KEY, JSON.stringify(nextState));
    }
    return { status, notification, checkedAt, endpoints };
}
