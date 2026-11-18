import { evaluateSendGuard, type SendGuardCode, type SendGuardDecision } from "@/domain/send-guard";
export const MIN_AUTO_CONFIDENCE: unknown = undefined as unknown as unknown;
export type SalesPolicyCode = SendGuardCode | "ACTION_NOT_PROPOSED" | "ACTION_NOT_EXECUTING" | "ACTION_KIND_MISMATCH" | "ACTION_PAYLOAD_INVALID" | "CONTROL_MODE_HUMAN" | "ASSIST_APPROVAL_REQUIRED" | "APPROVER_UNAVAILABLE" | "HUMAN_TAKEOVER_ACTIVE" | "CONVERSATION_NOT_ACTIVE" | "FAN_OPTED_OUT" | "STALE_TRIGGER" | "LOW_CONFIDENCE" | "VAULT_ITEM_NOT_FOUND" | "VAULT_ITEM_ACCOUNT_MISMATCH" | "VAULT_ITEM_NOT_OFFERABLE" | "VAULT_ITEM_ALREADY_PURCHASED" | "PRICE_NOT_APPROVED" | "PRICE_OUT_OF_RANGE" | "PRICE_REQUIRES_APPROVAL" | "PRICE_CAP_EXCEEDED";
export type SalesPolicyDecision = {
    allowed: true;
    aiMode: "AUTO" | "ASSIST";
    sentByUserId: string | null;
} | {
    allowed: false;
    disposition: "DENY" | "REVIEW";
    code: SalesPolicyCode;
};
export type SalesPolicyInput = {
    actionStatus: string;
    actionType: "send_text" | "send_ppv" | "handoff_to_human";
    controlMode: string;
    salesStage: string;
    takenOverAt: Date | null;
    contactOptOutAt: Date | null;
    triggerMessageId: string | null;
    latestInboundMessageId: string | null;
    confidence: number | null;
    approvedByUserId?: string | null;
    approverActive?: boolean;
    sendGuard?: SendGuardDecision;
    vaultItemExists?: boolean;
    vaultItemBelongsToAccount?: boolean;
    vaultItemOfferable?: boolean;
    alreadyPurchased?: boolean;
    requestedPriceCents?: number;
    approvedPriceCents?: number;
    minPriceCents?: number;
    maxPriceCents?: number;
    priceMode?: string;
    globalPriceCapCents?: number;
};
export function evaluateSalesActionPolicy(_input: SalesPolicyInput): SalesPolicyDecision {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function salesSendGuard(_input: Parameters<typeof evaluateSendGuard>[0], _actionType: "send_text" | "send_ppv"): SendGuardDecision {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function evaluateQueuedAgentDeliveryPolicy(_input: {
    actionStatus: string;
    aiMode: string;
    sentByUserId: string | null;
    controlMode: string;
    salesStage: string;
    takenOverAt: Date | null;
    contactOptOutAt: Date | null;
    triggerMessageId: string | null;
    latestInboundMessageId: string | null;
    confidence: number | null;
    isPpv: boolean;
    alreadyPurchased: boolean;
    requestedPriceCents?: number;
    approvedPriceCents?: number;
    minPriceCents?: number;
    maxPriceCents?: number;
    priceMode?: string;
    vaultItemOfferable?: boolean;
    globalPriceCapCents?: number;
}): {
    allowed: true;
} | {
    allowed: false;
    code: SalesPolicyCode;
} {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
