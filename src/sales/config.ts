import { z } from "zod";
type BusinessHours = {
    days: number[];
    start: string;
    end: string;
};
export type VaultPriceMode = "FIXED" | "AI_ASSISTED" | "AI_AUTO";
export type SalesProfileConfig = {
    persona: string;
    kbText: string;
    language: string;
    timezone: string;
    businessHours: BusinessHours;
    defaultControlMode: "HUMAN" | "ASSIST" | "AUTO";
    maxFollowUps: number;
    globalPriceCapCents: number;
    stylePreset: "BALANCED" | "WARM" | "FLIRTY" | "CALM" | "CONFIDENT" | "CUSTOM";
    firstMessage: string;
    ownerInstructions: string;
};
export const BusinessHoursSchema = z.custom<BusinessHours>(() => false);
export const SalesProfileConfigSchema = z.custom<SalesProfileConfig>(() => false);
export const SalesProfileFormSchema = z.custom<SalesProfileConfig & {
    accountId: string;
}>(() => false);
export const VaultPriceModeSchema = z.custom<VaultPriceMode>(() => false);
export const PriceGroupFormSchema = z.custom<Record<string, unknown>>(() => false);
export const ProductRulesSchema = z.custom<Record<string, unknown>>(() => false);
export type SalesReadinessCode = "AUTOMATION_NOT_DISTRIBUTED";
export function summarizeSalesReadiness(_input: unknown): never { throw new Error("AUTOMATION_NOT_DISTRIBUTED"); }
export async function getSalesReadiness(_db: unknown, _id: string): Promise<never> { throw new Error("AUTOMATION_NOT_DISTRIBUTED"); }
