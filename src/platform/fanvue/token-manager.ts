import "server-only";
import { getTenantDb } from "@/lib/tenant-db";
import type { PlatformAccountContext } from "@/platform/adapter";
import { acquireRefreshLease, loadPlatformTokens, releaseRefreshLease, savePlatformTokens } from "@/platform/secrets/credential-store";
import { FanvueOAuthError, FanvueScopeError, fanvueScopeProfileForCapabilities, getFanvueOAuthConfig, refreshFanvueTokens, validateFanvueScopes } from "@/platform/fanvue/oauth";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function getFanvueAccessToken(context: PlatformAccountContext, forceRefresh = false): Promise<string> {
    const tdb = getTenantDb(context.agencyId);
    const current = await loadPlatformTokens(tdb, context.agencyId, context.connectionId);
    if (context.secretRef !== `dbenc:${current.id}`) {
        throw new Error("Fanvue credential reference mismatch");
    }
    if (!forceRefresh && current.payload.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
        return current.payload.accessToken;
    }
    const leaseOwner = await acquireRefreshLease(tdb, context.agencyId, context.connectionId);
    if (!leaseOwner) {
        for (let attempt = 0; attempt < 10; attempt++) {
            await wait(100);
            const updated = await loadPlatformTokens(tdb, context.agencyId, context.connectionId);
            if (updated.version !== current.version)
                return updated.payload.accessToken;
        }
        throw new Error("Fanvue token refresh is already in progress");
    }
    try {
        const latest = await loadPlatformTokens(tdb, context.agencyId, context.connectionId);
        if (latest.version !== current.version) {
            await releaseRefreshLease(tdb, context.agencyId, context.connectionId, leaseOwner);
            return latest.payload.accessToken;
        }
        if (!forceRefresh && latest.payload.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
            await releaseRefreshLease(tdb, context.agencyId, context.connectionId, leaseOwner);
            return latest.payload.accessToken;
        }
        const refreshed = await refreshFanvueTokens({
            config: getFanvueOAuthConfig(),
            refreshToken: latest.payload.refreshToken,
        });
        const scopes = validateFanvueScopes(refreshed.scope.split(/\s+/), fanvueScopeProfileForCapabilities(context.capabilities));
        const expiresAt = Date.now() + refreshed.expires_in * 1000;
        await savePlatformTokens(tdb, context.agencyId, context.connectionId, {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            idToken: refreshed.id_token ?? latest.payload.idToken,
            expiresAt,
            scopes,
        });
        await tdb.platformConnection.update({
            where: { id: context.connectionId },
            data: {
                grantedScopes: scopes,
                expiresAt: new Date(expiresAt),
                lastVerifiedAt: new Date(),
                lastErrorCode: null,
            },
        });
        return refreshed.access_token;
    }
    catch (error) {
        await releaseRefreshLease(tdb, context.agencyId, context.connectionId, leaseOwner);
        const needsReauth = error instanceof FanvueScopeError ||
            (error instanceof FanvueOAuthError && [400, 401].includes(error.status));
        await tdb.platformConnection.update({
            where: { id: context.connectionId },
            data: {
                status: needsReauth ? "REAUTH_REQUIRED" : "ACTIVE",
                lastErrorCode: needsReauth
                    ? error instanceof FanvueScopeError
                        ? error.code
                        : "FANVUE_REFRESH_REJECTED"
                    : "FANVUE_REFRESH_FAILED",
            },
        });
        throw error;
    }
}
