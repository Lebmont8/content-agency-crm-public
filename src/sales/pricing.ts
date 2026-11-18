export type EffectivePricing = {
    basePriceCents: number;
    minPriceCents: number;
    maxPriceCents: number;
    priceMode: "FIXED" | "AI_ASSISTED" | "AI_AUTO";
    maxDiscountPercent: number;
    source: "ITEM" | "GROUP";
};
type PriceRow = {
    defaultPriceCents: number;
    approvedPriceCents: number | null;
};
export function effectiveVaultPricing(item: PriceRow): EffectivePricing {
    const price = item.approvedPriceCents ?? item.defaultPriceCents;
    return { basePriceCents: price, minPriceCents: price, maxPriceCents: price, priceMode: "FIXED", maxDiscountPercent: 0, source: "ITEM" };
}
export function priceAllowed(input: {
    requestedPriceCents: number;
    aiMode: "NONE" | "ASSIST" | "AUTO";
    pricing: EffectivePricing;
    globalPriceCapCents: number;
}): boolean {
    return input.aiMode === "NONE" && Number.isInteger(input.requestedPriceCents) && input.requestedPriceCents === input.pricing.basePriceCents;
}
export function adaptivePrice(_input: unknown): never { throw new Error("AUTOMATION_NOT_DISTRIBUTED"); }
