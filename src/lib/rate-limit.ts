import "server-only";
type Bucket = {
    count: number;
    resetAt: number;
};
const buckets = new Map<string, Bucket>();
let lastSweep = 0;
function sweep(now: number) {
    if (now - lastSweep < 60000)
        return;
    lastSweep = now;
    for (const [key, b] of buckets)
        if (b.resetAt <= now)
            buckets.delete(key);
}
export interface RateLimitResult {
    ok: boolean;
    remaining: number;
    retryAfterSec: number;
}
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    sweep(now);
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
    }
    b.count += 1;
    const ok = b.count <= limit;
    return {
        ok,
        remaining: Math.max(0, limit - b.count),
        retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
    };
}
export function rateLimitReset(key: string): void {
    buckets.delete(key);
}
