import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_BLOCK_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 5;
type ThrottleResult = {
    attemptCount: number;
    blockedUntil: Date | null;
};
export function normalizeLoginIdentifier(email: string): string {
    return email.trim().toLowerCase();
}
export function hashLoginIdentifier(email: string): string {
    return crypto
        .createHash("sha256")
        .update(normalizeLoginIdentifier(email), "utf8")
        .digest("hex");
}
export async function isLoginBlocked(email: string, now = new Date()): Promise<boolean> {
    const row = await db.loginThrottle.findUnique({
        where: { identifierHash: hashLoginIdentifier(email) },
        select: { blockedUntil: true },
    });
    return !!row?.blockedUntil && row.blockedUntil > now;
}
export async function recordLoginFailure(email: string, now = new Date()): Promise<{
    blocked: boolean;
    newlyBlocked: boolean;
}> {
    const identifierHash = hashLoginIdentifier(email);
    const cutoff = new Date(now.getTime() - LOGIN_WINDOW_MS);
    const nextBlockedUntil = new Date(now.getTime() + LOGIN_BLOCK_MS);
    const rows = await db.$queryRaw<ThrottleResult[]> `
    INSERT INTO "LoginThrottle" (
      "identifierHash", "attemptCount", "windowStartedAt", "blockedUntil", "updatedAt"
    ) VALUES (
      ${identifierHash}, 1, ${now}, NULL, ${now}
    )
    ON CONFLICT ("identifierHash") DO UPDATE SET
      "attemptCount" = CASE
        WHEN "LoginThrottle"."windowStartedAt" <= ${cutoff} THEN 1
        ELSE "LoginThrottle"."attemptCount" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "LoginThrottle"."windowStartedAt" <= ${cutoff} THEN ${now}
        ELSE "LoginThrottle"."windowStartedAt"
      END,
      "blockedUntil" = CASE
        WHEN "LoginThrottle"."blockedUntil" > ${now}
          THEN "LoginThrottle"."blockedUntil"
        WHEN "LoginThrottle"."windowStartedAt" <= ${cutoff}
          THEN NULL
        WHEN "LoginThrottle"."attemptCount" + 1 >= ${LOGIN_MAX_ATTEMPTS}
          THEN ${nextBlockedUntil}
        ELSE NULL
      END,
      "updatedAt" = ${now}
    RETURNING "attemptCount", "blockedUntil"
  `;
    const row = rows[0];
    const blocked = !!row?.blockedUntil && row.blockedUntil > now;
    return {
        blocked,
        newlyBlocked: blocked && row.attemptCount === LOGIN_MAX_ATTEMPTS,
    };
}
export async function clearLoginFailures(email: string): Promise<void> {
    await db.loginThrottle.deleteMany({
        where: { identifierHash: hashLoginIdentifier(email) },
    });
}
