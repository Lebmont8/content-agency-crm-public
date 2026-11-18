import type { TenantDb } from "@/lib/tenant-db";
export type Segment = "whale" | "new" | "dormant" | "expired";
export const SEGMENTS: Segment[] = ["whale", "new", "dormant", "expired"];
const DAY = 24 * 60 * 60 * 1000;
export const NEW_DAYS = 7;
export const DORMANT_DAYS = 14;
export const WHALE_PERCENTILE = 0.05;
export function whaleThresholdCents(spendsCents: number[]): number {
    const positive = spendsCents.filter((s) => s > 0).sort((a, b) => b - a);
    if (positive.length === 0)
        return Number.POSITIVE_INFINITY;
    const k = Math.max(1, Math.floor(positive.length * WHALE_PERCENTILE));
    return positive[k - 1];
}
export interface FanForSegments {
    totalSpentCents: number;
    subscribedAt: Date;
    lastActiveAt: Date;
    subscriptionStatus: "ACTIVE" | "EXPIRED";
}
export function computeSegments(fan: FanForSegments, ctx: {
    now: Date;
    whaleThresholdCents: number;
}): Segment[] {
    const segments: Segment[] = [];
    if (fan.totalSpentCents > 0 &&
        fan.totalSpentCents >= ctx.whaleThresholdCents) {
        segments.push("whale");
    }
    if (ctx.now.getTime() - fan.subscribedAt.getTime() < NEW_DAYS * DAY) {
        segments.push("new");
    }
    if (ctx.now.getTime() - fan.lastActiveAt.getTime() >= DORMANT_DAYS * DAY) {
        segments.push("dormant");
    }
    if (fan.subscriptionStatus === "EXPIRED") {
        segments.push("expired");
    }
    return segments;
}
export async function getFanSegmentMap(tdb: TenantDb, creatorAccountIds: string[], now: Date = new Date()): Promise<Map<string, Segment[]>> {
    if (creatorAccountIds.length === 0)
        return new Map();
    const fans = await tdb.fan.findMany({
        where: { creatorAccountId: { in: creatorAccountIds } },
        select: {
            id: true,
            creatorAccountId: true,
            totalSpentCents: true,
            subscribedAt: true,
            lastActiveAt: true,
            subscriptionStatus: true,
        },
    });
    const spendsByAccount = new Map<string, number[]>();
    for (const fan of fans) {
        const arr = spendsByAccount.get(fan.creatorAccountId) ?? [];
        arr.push(fan.totalSpentCents);
        spendsByAccount.set(fan.creatorAccountId, arr);
    }
    const thresholdByAccount = new Map<string, number>();
    for (const [accountId, spends] of spendsByAccount) {
        thresholdByAccount.set(accountId, whaleThresholdCents(spends));
    }
    const map = new Map<string, Segment[]>();
    for (const fan of fans) {
        map.set(fan.id, computeSegments(fan, {
            now,
            whaleThresholdCents: thresholdByAccount.get(fan.creatorAccountId) ??
                Number.POSITIVE_INFINITY,
        }));
    }
    return map;
}
