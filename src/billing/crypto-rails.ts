import { z } from "zod";
const RailSchema = z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,31}$/),
    asset: z.string().trim().min(2).max(16),
    network: z.string().trim().min(2).max(64),
    address: z.string().trim().min(12).max(256),
    requiredConfirmations: z.number().int().min(1).max(100).default(1),
    usdPegged: z.literal(true),
});
export type CryptoRail = z.infer<typeof RailSchema>;
type RuntimeEnv = Readonly<Record<string, string | undefined>>;
export function configuredCryptoRails(env: RuntimeEnv = process.env): CryptoRail[] {
    const raw = env.CRYPTO_PAYMENT_RAILS_JSON?.trim();
    if (raw) {
        try {
            const parsed = z.array(RailSchema).max(20).safeParse(JSON.parse(raw));
            if (parsed.success) {
                const ids = new Set<string>();
                return parsed.data.filter((rail) => {
                    if (ids.has(rail.id))
                        return false;
                    ids.add(rail.id);
                    return true;
                });
            }
        }
        catch {
            return [];
        }
    }
    const address = env.CRYPTO_WALLET_ADDRESS?.trim();
    if (!address || address.length < 12)
        return [];
    return [
        {
            id: "legacy-usdt",
            asset: "USDT",
            network: env.CRYPTO_WALLET_NETWORK?.trim() || "TRC-20",
            address,
            requiredConfirmations: 1,
            usdPegged: true,
        },
    ];
}
export function stablecoinAmount(amountCents: number): string {
    return (Math.max(0, amountCents) / 100).toFixed(2);
}
