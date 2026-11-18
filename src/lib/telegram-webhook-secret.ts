import crypto from "node:crypto";
import "server-only";
const TELEGRAM_SECRET_PATTERN = /^[A-Za-z0-9_-]+$/;
const TELEGRAM_SECRET_MIN_LENGTH = 32;
const TELEGRAM_SECRET_MAX_LENGTH = 256;
export function verifyTelegramWebhookSecret(configured: string | undefined, provided: string | null): boolean {
    const secret = configured?.trim() ?? "";
    if (!provided ||
        secret.length < TELEGRAM_SECRET_MIN_LENGTH ||
        secret.length > TELEGRAM_SECRET_MAX_LENGTH ||
        !TELEGRAM_SECRET_PATTERN.test(secret) ||
        !TELEGRAM_SECRET_PATTERN.test(provided)) {
        return false;
    }
    const expected = Buffer.from(secret, "utf8");
    const candidate = Buffer.from(provided, "utf8");
    return (expected.length === candidate.length &&
        crypto.timingSafeEqual(expected, candidate));
}
