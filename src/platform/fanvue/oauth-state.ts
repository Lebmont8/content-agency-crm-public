import crypto from "node:crypto";
import { z } from "zod";
import { decryptJson, encryptJson } from "@/platform/secrets/credential-crypto";
import type { FanvueOAuthProfile } from "@/platform/fanvue/oauth";
export const FANVUE_OAUTH_COOKIE = "fanvue_oauth_state";
const OAUTH_STATE_AAD = "fanvue-oauth-state:v2";
const statePayloadSchema = z.object({
    agencyId: z.string().min(1),
    userId: z.string().min(1),
    accountId: z.string().min(1),
    connectionId: z.string().min(1),
    scopeProfile: z.enum(["shadow", "live_sales"]),
    state: z.string().min(32),
    codeVerifier: z.string().min(43).max(128),
    expiresAt: z.number().int().positive(),
});
export type FanvueOAuthState = z.infer<typeof statePayloadSchema>;
function base64url(input: Buffer): string {
    return input.toString("base64url");
}
export function createFanvueOAuthState(key: Buffer, identity: Pick<FanvueOAuthState, "agencyId" | "userId" | "accountId" | "connectionId" | "scopeProfile">, now = Date.now()): {
    state: string;
    codeChallenge: string;
    sealed: string;
} {
    const state = base64url(crypto.randomBytes(32));
    const codeVerifier = base64url(crypto.randomBytes(48));
    const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
    const encrypted = encryptJson({ ...identity, state, codeVerifier, expiresAt: now + 10 * 60 * 1000 }, key, OAUTH_STATE_AAD);
    return {
        state,
        codeChallenge,
        sealed: [encrypted.iv, encrypted.authTag, encrypted.ciphertext]
            .map((part) => Buffer.from(part, "base64").toString("base64url"))
            .join("."),
    };
}
export type { FanvueOAuthProfile };
export function openFanvueOAuthState(sealed: string, key: Buffer, now = Date.now()): FanvueOAuthState {
    const parts = sealed.split(".");
    if (parts.length !== 3)
        throw new Error("Invalid OAuth state cookie");
    const [iv, authTag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url").toString("base64"));
    const payload = statePayloadSchema.parse(decryptJson({ iv, authTag, ciphertext }, key, OAUTH_STATE_AAD));
    if (payload.expiresAt < now)
        throw new Error("OAuth state expired");
    return payload;
}
export function validateFanvueOAuthState(payload: FanvueOAuthState, callbackState: string, auth: {
    userId: string;
    agencyId: string;
}): void {
    if (payload.state !== callbackState ||
        payload.userId !== auth.userId ||
        payload.agencyId !== auth.agencyId) {
        throw new Error("OAuth state mismatch");
    }
}
