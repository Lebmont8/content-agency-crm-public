import { NextResponse } from "next/server";
import { getAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getAccessibleAccounts } from "@/domain/access";
import { generateLiveIncoming } from "@/platform/mock/generator";
import { enqueueInboundEvent } from "@/inbound/enqueue";
export async function POST() {
    if (process.env.NODE_ENV === "production" || process.env.MOCK_LIVE !== "true") {
        return NextResponse.json({ created: false }, { status: 404 });
    }
    const auth = await getAuth();
    if (!auth) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const tdb = getTenantDb(auth.user.agencyId);
    const accounts = (await getAccessibleAccounts(tdb, auth.user)).filter((a) => a.platform === "mock" && a.status === "ACTIVE");
    if (accounts.length === 0)
        return NextResponse.json({ created: false });
    if (Math.random() < 0.35)
        return NextResponse.json({ created: false });
    const account = accounts[Math.floor(Math.random() * accounts.length)];
    const live = generateLiveIncoming(account.externalAccountRef);
    if (!live)
        return NextResponse.json({ created: false });
    const connection = await tdb.platformConnection.findUnique({
        where: {
            agencyId_creatorAccountId: {
                agencyId: auth.user.agencyId,
                creatorAccountId: account.id,
            },
        },
    });
    if (!connection || connection.status !== "ACTIVE") {
        return NextResponse.json({ created: false });
    }
    const queued = await enqueueInboundEvent(tdb, {
        agencyId: auth.user.agencyId,
        connectionId: connection.id,
        providerEventId: live.message.externalRef,
        type: "mock.message.received",
        payload: {
            fanExternalRef: live.fanExternalRef,
            body: live.message.body,
            sentAt: live.message.sentAt.toISOString(),
        },
        occurredAt: live.message.sentAt,
    });
    return NextResponse.json({
        created: !queued.duplicate,
        queued: true,
        eventId: queued.eventId,
    }, { status: 202 });
}
