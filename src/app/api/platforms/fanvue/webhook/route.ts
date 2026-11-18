import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { enqueueInboundEvent } from "@/inbound/enqueue";
import { resolveFanvueWebhookConnection } from "@/lib/fanvue-webhook";
import { getTenantDb } from "@/lib/tenant-db";
import { FANVUE_WEBHOOK_MAX_BODY_BYTES, fanvueWebhookCreatorUuid, isSupportedFanvueWebhookType, parseFanvueWebhookEnvelope, verifyFanvueWebhookSignature } from "@/platform/fanvue/webhook";
export const runtime = "nodejs";
function response(status = 202) {
    return NextResponse.json({ ok: true }, { status });
}
async function readBoundedBody(request: Request): Promise<string | null> {
    if (!request.body)
        return "";
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        if (total > FANVUE_WEBHOOK_MAX_BODY_BYTES) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(body);
    }
    catch {
        return null;
    }
}
export async function POST(request: Request): Promise<Response> {
    const signingSecret = process.env.FANVUE_WEBHOOK_SECRET;
    if (!signingSecret) {
        return NextResponse.json({ ok: false }, { status: 503 });
    }
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) &&
        declaredLength > FANVUE_WEBHOOK_MAX_BODY_BYTES) {
        return NextResponse.json({ ok: false }, { status: 413 });
    }
    const rawBody = await readBoundedBody(request);
    if (rawBody === null) {
        return NextResponse.json({ ok: false }, { status: 413 });
    }
    const signature = request.headers.get("x-fanvue-signature") ?? "";
    if (!verifyFanvueWebhookSignature(rawBody, signature, signingSecret)) {
        return NextResponse.json({ ok: false }, { status: 401 });
    }
    let envelope;
    try {
        envelope = parseFanvueWebhookEnvelope(rawBody);
    }
    catch {
        return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (!isSupportedFanvueWebhookType(envelope.type))
        return response();
    const creatorUuid = fanvueWebhookCreatorUuid(envelope);
    if (!creatorUuid)
        return response();
    const target = await resolveFanvueWebhookConnection(creatorUuid);
    if (!target)
        return response();
    const tdb = getTenantDb(target.agencyId);
    await enqueueInboundEvent(tdb, {
        agencyId: target.agencyId,
        connectionId: target.connectionId,
        providerEventId: envelope.id,
        type: envelope.type,
        payload: envelope.data as Prisma.InputJsonValue,
        occurredAt: new Date(envelope.timestamp),
    });
    return response();
}
