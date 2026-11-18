export interface CopilotMessage {
    direction: "in" | "out";
    body: string;
}
export interface CopilotFanContext {
    displayName: string;
    totalSpentCents: number;
    segments: string[];
    notes: string[];
}
export interface CopilotVaultItem {
    id: string;
    title: string;
    defaultPriceCents: number;
    mediaType: string;
    minPriceCents?: number;
    maxPriceCents?: number;
    priceMode?: "FIXED" | "AI_ASSISTED" | "AI_AUTO";
    maxDiscountPercent?: number;
}
export interface ReplyRequest {
    history: CopilotMessage[];
    fan: CopilotFanContext;
    persona: string;
    stylePreset?: "BALANCED" | "WARM" | "FLIRTY" | "CALM" | "CONFIDENT" | "CUSTOM";
    firstMessage?: string;
    ownerInstructions?: string;
    knowledgeBase?: string;
    language?: string;
    availableProducts?: CopilotVaultItem[];
    globalPriceCapCents?: number;
}
export interface ReplyDraft {
    body: string;
}
export interface PpvSuggestion {
    vaultItemId: string;
    priceCents: number;
    caption: string;
}
export interface Copilot {
    decide(context: import("@/sales/context").SalesContext): Promise<unknown>;
    suggestReply(req: ReplyRequest): Promise<ReplyDraft>;
    suggestPpv(req: ReplyRequest, vault: CopilotVaultItem[]): Promise<PpvSuggestion | null>;
}
export type CopilotProviderTrace = {
    provider: "openai";
    model: string;
    providerRequestId: string | null;
    inputTokens: number;
    outputTokens: number;
    reservedCostMicros: number;
};
export interface TraceableCopilot extends Copilot {
    readonly provider: "openai";
    readonly model: string;
    readonly estimatedCostMicros: number;
    decideWithTrace(context: import("@/sales/context").SalesContext): Promise<{
        decision: unknown;
        trace: CopilotProviderTrace;
    }>;
}
export function isTraceableCopilot(_value: Copilot): _value is TraceableCopilot {
    return false;
}
export { sanitizeFanText } from "./sanitize";
export function getCopilot(): Copilot {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
