import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { assertCan } from "@/auth/permissions";
import { getTenantDb } from "@/lib/tenant-db";
import { logAudit } from "@/domain/audit";
import { parseCredentialKey } from "@/platform/secrets/credential-crypto";
import { savePlatformTokens, deletePlatformTokens } from "@/platform/secrets/credential-store";
import { exchangeFanvueAuthorizationCode, fanvueCapabilitiesForProfile, FanvueScopeError, fetchFanvueIdentity, getFanvueOAuthConfig, getFanvueOAuthProfile, validateFanvueScopes } from "@/platform/fanvue/oauth";
import { FANVUE_OAUTH_COOKIE, openFanvueOAuthState, validateFanvueOAuthState } from "@/platform/fanvue/oauth-state";
function settingsRedirect(request: NextRequest, result: string) {
    const response = NextResponse.redirect(new URL(`/settings/accounts?fanvue=${result}`, request.url));
    response.cookies.delete(FANVUE_OAUTH_COOKIE);
    return response;
}
export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    assertCan(auth.user.role, "assignments.manage");
    const sealed = request.cookies.get(FANVUE_OAUTH_COOKIE)?.value;
    const state = request.nextUrl.searchParams.get("state");
    const code = request.nextUrl.searchParams.get("code");
    const providerError = request.nextUrl.searchParams.get("error");
    if (!sealed || !state)
        return settingsRedirect(request, "invalid_state");
    let oauthState;
    try {
        const rawKey = process.env.PLATFORM_CREDENTIAL_KEY;
        if (!rawKey)
            throw new Error("Credential key missing");
        oauthState = openFanvueOAuthState(sealed, parseCredentialKey(rawKey));
        validateFanvueOAuthState(oauthState, state, {
            userId: auth.user.id,
            agencyId: auth.user.agencyId,
        });
    }
    catch {
        return settingsRedirect(request, "invalid_state");
    }
    const tdb = getTenantDb(auth.user.agencyId);
    const account = await tdb.creatorAccount.findUnique({
        where: { id: oauthState.accountId },
        include: { connection: true },
    });
    if (!account ||
        account.platform !== "fanvue" ||
        !account.connection ||
        account.connection.id !== oauthState.connectionId) {
        return settingsRedirect(request, "invalid_account");
    }
    if (!code || providerError) {
        await tdb.platformConnection.update({
            where: { id: account.connection.id },
            data: { status: "DRAFT", lastErrorCode: "FANVUE_OAUTH_DENIED" },
        });
        await logAudit(tdb, auth.user.agencyId, {
            actorId: auth.user.id,
            action: "platform.connection.authorize",
            entityType: "PlatformConnection",
            entityId: account.connection.id,
            after: { platform: "fanvue", status: "DRAFT", result: "denied" },
        });
        return settingsRedirect(request, "denied");
    }
    try {
        if (getFanvueOAuthProfile() !== oauthState.scopeProfile ||
            (oauthState.scopeProfile === "live_sales" &&
                !process.env.FANVUE_WEBHOOK_SECRET?.trim())) {
            throw new FanvueScopeError("Fanvue OAuth profile changed during authorization");
        }
        const tokens = await exchangeFanvueAuthorizationCode({
            config: getFanvueOAuthConfig(),
            code,
            codeVerifier: oauthState.codeVerifier,
        });
        const identity = await fetchFanvueIdentity(tokens.access_token);
        const scopes = validateFanvueScopes(tokens.scope.split(/\s+/), oauthState.scopeProfile);
        const credential = await savePlatformTokens(tdb, auth.user.agencyId, account.connection.id, {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            idToken: tokens.id_token,
            expiresAt: Date.now() + tokens.expires_in * 1000,
            scopes,
        });
        try {
            await tdb.platformConnection.update({
                where: { id: account.connection.id },
                data: {
                    status: "ACTIVE",
                    remoteAccountId: identity.uuid,
                    secretRef: `dbenc:${credential.id}`,
                    grantedScopes: scopes,
                    capabilities: fanvueCapabilitiesForProfile(oauthState.scopeProfile),
                    lastVerifiedAt: new Date(),
                    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                    lastErrorCode: null,
                },
            });
            await logAudit(tdb, auth.user.agencyId, {
                actorId: auth.user.id,
                action: "platform.connection.authorize",
                entityType: "PlatformConnection",
                entityId: account.connection.id,
                after: {
                    platform: "fanvue",
                    status: "ACTIVE",
                    remoteAccountId: identity.uuid,
                    grantedScopes: scopes,
                    scopeProfile: oauthState.scopeProfile,
                },
            });
        }
        catch (error) {
            await deletePlatformTokens(tdb, auth.user.agencyId, account.connection.id);
            throw error;
        }
    }
    catch (error) {
        const errorCode = error instanceof FanvueScopeError
            ? error.code
            : "FANVUE_OAUTH_FAILED";
        await tdb.platformConnection.update({
            where: { id: account.connection.id },
            data: {
                status: error instanceof FanvueScopeError ? "REAUTH_REQUIRED" : "ERROR",
                lastErrorCode: errorCode,
            },
        });
        await logAudit(tdb, auth.user.agencyId, {
            actorId: auth.user.id,
            action: "platform.connection.authorize",
            entityType: "PlatformConnection",
            entityId: account.connection.id,
            after: { platform: "fanvue", result: "failed", code: errorCode },
        });
        return settingsRedirect(request, "error");
    }
    return settingsRedirect(request, "connected");
}
