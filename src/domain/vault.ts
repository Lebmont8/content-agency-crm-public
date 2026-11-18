import type { TenantDb } from "@/lib/tenant-db";
export interface SendForStats {
    priceCents: number;
    purchasedAt: Date | null;
}
export interface VaultItemStats {
    sends: number;
    purchases: number;
    revenueCents: number;
    conversion: number;
}
export function computeVaultItemStats(sends: SendForStats[]): VaultItemStats {
    let purchases = 0;
    let revenueCents = 0;
    for (const s of sends) {
        if (s.purchasedAt) {
            purchases += 1;
            revenueCents += s.priceCents;
        }
    }
    return {
        sends: sends.length,
        purchases,
        revenueCents,
        conversion: sends.length === 0 ? 0 : purchases / sends.length,
    };
}
export async function fanOwnsVaultItem(tdb: TenantDb, fanId: string, vaultItemId: string): Promise<boolean> {
    const owned = await tdb.vaultSend.findFirst({
        where: { fanId, vaultItemId, purchasedAt: { not: null } },
        select: { id: true },
    });
    return owned !== null;
}
export async function getVaultItemStats(tdb: TenantDb, creatorAccountId?: string): Promise<Map<string, VaultItemStats>> {
    const sends = await tdb.vaultSend.findMany({
        where: creatorAccountId ? { vaultItem: { creatorAccountId } } : {},
        select: { vaultItemId: true, priceCents: true, purchasedAt: true },
    });
    const byItem = new Map<string, SendForStats[]>();
    for (const s of sends) {
        const list = byItem.get(s.vaultItemId);
        if (list)
            list.push(s);
        else
            byItem.set(s.vaultItemId, [s]);
    }
    const out = new Map<string, VaultItemStats>();
    for (const [id, list] of byItem)
        out.set(id, computeVaultItemStats(list));
    return out;
}
