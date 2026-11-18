import type { TenantDb } from "@/lib/tenant-db";
import { type Segment } from "@/domain/segments";
import type { SalesStageName } from "@/sales/state";
export type SalesContextMessage = {
    id: string;
    direction: "in" | "out";
    trust: "UNTRUSTED_FAN_INPUT" | "TRUSTED_CREATOR_OUTPUT";
    content: string;
    sentAt: Date;
};
export type SalesContext = {
    account: {
        id: string;
        platform: string;
        pilotMode: "OFF" | "SHADOW" | "ASSIST" | "AUTO";
    };
    persona: {
        displayName: string;
        instructions: string;
        knowledgeBase: string;
        stylePreset: string;
        firstMessage: string;
        ownerInstructions: string;
    };
    salesConfig: {
        profileId: string | null;
        version: number | null;
        language: string;
        timezone: string;
        businessHours: unknown;
        defaultControlMode: "HUMAN" | "ASSIST" | "AUTO";
        maxFollowUps: number;
        globalPriceCapCents: number | null;
    };
    conversation: {
        id: string;
        salesStage: SalesStageName;
        memorySummary: string | null;
        intent: string | null;
        budgetCents: number | null;
        interests: string[];
        objections: string[];
        promises: string[];
        nextActionAt: Date | null;
    };
    fan: {
        id: string;
        displayName: string;
        totalSpentCents: number;
        segments: Segment[];
        notes: string[];
        contactOptOutAt: Date | null;
    };
    history: SalesContextMessage[];
    availableProducts: Array<{
        id: string;
        title: string;
        mediaType: string;
        defaultPriceCents: number;
        minPriceCents: number;
        maxPriceCents: number;
        priceMode: "FIXED" | "AI_ASSISTED" | "AI_AUTO";
        maxDiscountPercent: number;
    }>;
};
export function buildSalesContext(_tdb: TenantDb, _conversationId: string): Promise<SalesContext> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
