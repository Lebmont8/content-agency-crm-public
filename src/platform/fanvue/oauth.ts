import "server-only";
import { z } from "zod";
const AUTH_URL = "https://auth.fanvue.com/oauth2/auth";
const TOKEN_URL = "https://auth.fanvue.com/oauth2/token";
const API_URL = "https://api.fanvue.com";
export const FANVUE_API_VERSION = "2025-06-26";
export const FANVUE_READ_SCOPES = [
    "openid",
    "offline_access",
    "offline",
    "read:self",
    "read:fan",
    "read:chat",
] as const;
export const FANVUE_LIVE_SALES_SCOPES = [
    ...FANVUE_READ_SCOPES,
    "read:creator",
    "read:insights",
    "read:media",
    "write:chat",
] as const;
export type FanvueOAuthProfile = "shadow" | "live_sales";
const FANVUE_SCOPE_PROFILES: Record<FanvueOAuthProfile, readonly string[]> = {
    shadow: FANVUE_READ_SCOPES,
    live_sales: FANVUE_LIVE_SALES_SCOPES,
};
export class FanvueScopeError extends Error {
    readonly code = "FANVUE_SCOPE_MISMATCH";
    constructor(message = "Fanvue granted scopes do not match the requested contract") {
        super(message);
        this.name = "FanvueScopeError";
    }
}
export function getFanvueOAuthProfile(value = process.env.FANVUE_OAUTH_PROFILE): FanvueOAuthProfile {
    if (!value || value === "shadow")
        return "shadow";
    if (value === "live_sales")
        return value;
    throw new Error("FANVUE_OAUTH_PROFILE must be shadow or live_sales");
}
export function isFanvueLiveSalesEnabled(value = process.env.FANVUE_OAUTH_PROFILE): boolean {
    return value === "live_sales";
}
export function fanvueScopeProfileForCapabilities(capabilities: readonly string[]): FanvueOAuthProfile {
    return capabilities.includes("send_text") || capabilities.includes("send_ppv")
        ? "live_sales"
        : "shadow";
}
export function fanvueCapabilitiesForProfile(profile: FanvueOAuthProfile): string[] {
    return profile === "live_sales"
        ? ["sync", "send_text", "send_ppv"]
        : ["sync"];
}
export function getFanvueScopes(profile: FanvueOAuthProfile): readonly string[] {
    return FANVUE_SCOPE_PROFILES[profile];
}
export function validateFanvueScopes(scopes: readonly string[], profile: FanvueOAuthProfile): string[] {
    const required = FANVUE_SCOPE_PROFILES[profile];
    const requiredSet = new Set<string>(required);
    const normalized = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
    if (normalized.length !== required.length ||
        required.some((scope) => !normalized.includes(scope)) ||
        normalized.some((scope) => !requiredSet.has(scope))) {
        throw new FanvueScopeError();
    }
    return normalized;
}
export function validateFanvueReadOnlyScopes(scopes: readonly string[]): string[] {
    return validateFanvueScopes(scopes, "shadow");
}
const tokenSchema = z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    id_token: z.string().min(1).optional(),
    token_type: z.string().optional(),
    expires_in: z.number().int().positive(),
    scope: z.string().min(1),
});
const identitySchema = z.object({
    uuid: z.string().min(1),
    displayName: z.string().optional(),
    handle: z.string().optional(),
}).passthrough();
export type FanvueOAuthTokens = z.infer<typeof tokenSchema>;
export class FanvueOAuthError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "FanvueOAuthError";
    }
}
export type FanvueOAuthConfig = {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
};
export function getFanvueOAuthConfig(): FanvueOAuthConfig {
    const clientId = process.env.FANVUE_CLIENT_ID;
    const clientSecret = process.env.FANVUE_CLIENT_SECRET;
    const redirectUri = process.env.FANVUE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error("Fanvue OAuth is not configured");
    }
    return { clientId, clientSecret, redirectUri };
}
export function buildFanvueAuthorizationUrl(input: {
    config: FanvueOAuthConfig;
    state: string;
    codeChallenge: string;
    scopeProfile?: FanvueOAuthProfile;
}): URL {
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", input.config.clientId);
    url.searchParams.set("redirect_uri", input.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", getFanvueScopes(input.scopeProfile ?? getFanvueOAuthProfile()).join(" "));
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url;
}
export async function exchangeFanvueAuthorizationCode(input: {
    config: FanvueOAuthConfig;
    code: string;
    codeVerifier: string;
    fetcher?: typeof fetch;
}): Promise<FanvueOAuthTokens> {
    const fetcher = input.fetcher ?? fetch;
    const response = await fetcher(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: input.config.clientId,
            client_secret: input.config.clientSecret,
            code: input.code,
            redirect_uri: input.config.redirectUri,
            code_verifier: input.codeVerifier,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new FanvueOAuthError("Fanvue token exchange failed", response.status);
    }
    return tokenSchema.parse(await response.json());
}
export async function refreshFanvueTokens(input: {
    config: FanvueOAuthConfig;
    refreshToken: string;
    fetcher?: typeof fetch;
}): Promise<FanvueOAuthTokens> {
    const fetcher = input.fetcher ?? fetch;
    const response = await fetcher(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: input.config.clientId,
            client_secret: input.config.clientSecret,
            refresh_token: input.refreshToken,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new FanvueOAuthError("Fanvue token refresh failed", response.status);
    }
    return tokenSchema.parse(await response.json());
}
export async function fetchFanvueIdentity(accessToken: string, fetcher: typeof fetch = fetch): Promise<z.infer<typeof identitySchema>> {
    const response = await fetcher(`${API_URL}/users/me`, {
        headers: {
            authorization: `Bearer ${accessToken}`,
            "X-Fanvue-API-Version": FANVUE_API_VERSION,
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
        throw new Error(`Fanvue identity verification failed (${response.status})`);
    const json = await response.json();
    const candidate = json && typeof json === "object" && "data" in json
        ? (json as {
            data: unknown;
        }).data
        : json;
    return identitySchema.parse(candidate);
}
