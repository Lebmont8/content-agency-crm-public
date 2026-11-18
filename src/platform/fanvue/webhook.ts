import crypto from "node:crypto";
import { z } from "zod";
export const FANVUE_WEBHOOK_MAX_BODY_BYTES = 128 * 1024;
export const FANVUE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const envelopeSchema = z.object({
    id: z.string().min(1).max(240),
    type: z.string().min(1).max(120),
    timestamp: z.string().datetime({ offset: true }),
    data: z.record(z.string(), z.unknown()),
}).strict();
export type FanvueWebhookEnvelope = z.infer<typeof envelopeSchema>;
export function parseFanvueWebhookEnvelope(rawBody: string): FanvueWebhookEnvelope {
    return envelopeSchema.parse(JSON.parse(rawBody) as unknown);
}
export function verifyFanvueWebhookSignature(rawBody: string, signatureHeader: string, signingSecret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = FANVUE_WEBHOOK_TOLERANCE_SECONDS): boolean {
    if (!signatureHeader || !signingSecret)
        return false;
    let timestamp: string | null = null;
    let signature: string | null = null;
    for (const rawPart of signatureHeader.split(",")) {
        const part = rawPart.trim();
        const separator = part.indexOf("=");
        if (separator <= 0)
            return false;
        const key = part.slice(0, separator);
        const value = part.slice(separator + 1);
        if (key === "t") {
            if (timestamp !== null)
                return false;
            timestamp = value;
        }
        else if (key === "v0") {
            if (signature !== null)
                return false;
            signature = value;
        }
    }
    if (!timestamp ||
        !signature ||
        !/^\d+$/.test(timestamp) ||
        !/^[a-f0-9]{64}$/i.test(signature)) {
        return false;
    }
    const signedAt = Number(timestamp);
    if (!Number.isSafeInteger(signedAt) ||
        Math.abs(nowSeconds - signedAt) > toleranceSeconds) {
        return false;
    }
    const expected = crypto
        .createHmac("sha256", signingSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest();
    const received = Buffer.from(signature, "hex");
    return (received.length === expected.length &&
        crypto.timingSafeEqual(received, expected));
}
export function fanvueWebhookCreatorUuid(envelope: FanvueWebhookEnvelope): string | null {
    const creator = envelope.data.creator;
    if (!creator || typeof creator !== "object" || Array.isArray(creator)) {
        return null;
    }
    const uuid = (creator as Record<string, unknown>).uuid;
    return typeof uuid === "string" && uuid ? uuid : null;
}
export function isSupportedFanvueWebhookType(type: string): boolean {
    return type === "creator.payment.succeeded";
}
