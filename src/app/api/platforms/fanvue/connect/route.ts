import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { assertCan } from "@/auth/permissions";
import { logAudit } from "@/domain/audit";
import { parseCredentialKey } from "@/platform/secrets/credential-crypto";
import { buildFanvueAuthorizationUrl, getFanvueOAuthProfile, getFanvueOAuthConfig } from "@/platform/fanvue/oauth";
import { createFanvueOAuthState, FANVUE_OAUTH_COOKIE } from "@/platform/fanvue/oauth-state";
export async function GET(request: NextRequest) {
    const { user } = await requireAuth();
    assertCan(user.role, "assignments.manage");
    const accountId = request.nextUrl.searchParams.get("accountId");
    if (!accountId)
        return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    const tdb = getTenantDb(user.agencyId);
    const account = await tdb.creatorAccount.findUnique({
        where: { id: accountId },
        include: { connection: true },
    });
    if (!account || account.platform !== "fanvue" || !account.connection) {
        return NextResponse.json({ error: "Fanvue account not found" }, { status: 404 });
    }
    const rawKey = process.env.PLATFORM_CREDENTIAL_KEY;
    if (!rawKey)
        return NextResponse.json({ error: "Fanvue OAuth is not configured" }, { status: 503 });
    let config;
    try {
        config = getFanvueOAuthConfig();
    }
    catch {
        return NextResponse.json({ error: "Fanvue OAuth is not configured" }, { status: 503 });
    }
    let scopeProfile;
    try {
        scopeProfile = getFanvueOAuthProfile();
    }
    catch {
        return NextResponse.json({ error: "Fanvue OAuth profile is invalid" }, { status: 503 });
    }
    if (scopeProfile === "live_sales" &&
        !process.env.FANVUE_WEBHOOK_SECRET?.trim()) {
        return NextResponse.json({ error: "Fanvue live sales is not configured" }, { status: 503 });
    }
    const oauth = createFanvueOAuthState(parseCredentialKey(rawKey), {
        agencyId: user.agencyId,
        userId: user.id,
        accountId: account.id,
        connectionId: account.connection.id,
        scopeProfile,
    });
    const authorizationUrl = buildFanvueAuthorizationUrl({
        config,
        state: oauth.state,
        codeChallenge: oauth.codeChallenge,
        scopeProfile,
    });
    await tdb.platformConnection.update({
        where: { id: account.connection.id },
        data: { status: "AUTHORIZING", lastErrorCode: null },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "platform.connection.authorize",
        entityType: "PlatformConnection",
        entityId: account.connection.id,
        after: { platform: "fanvue", status: "AUTHORIZING", scopeProfile },
    });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(FANVUE_OAUTH_COOKIE, oauth.sealed, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/platforms/fanvue/callback",
        maxAge: 10 * 60,
    });
    return response;
}
