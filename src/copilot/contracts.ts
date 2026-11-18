import { z } from "zod";
export type CopilotAction = {
    type: "send_text";
    body: string;
} | {
    type: "send_ppv";
    vaultItemId: string;
    priceCents: number;
    caption: string;
} | {
    type: "handoff_to_human";
    reason: string;
};
export type CopilotStatePatch = {
    stage?: string;
    summary?: string;
    nextActionAt?: string | null;
};
export type CopilotDecision = {
    statePatch: CopilotStatePatch;
    proposedActions: CopilotAction[];
    confidence: number;
    reason: string;
};
export const CopilotActionSchema = z.custom<CopilotAction>(() => false);
export const CopilotStatePatchSchema = z.custom<CopilotStatePatch>(() => false);
export const CopilotDecisionSchema = z.custom<CopilotDecision>(() => false);
export const COPILOT_DECISION_JSON_SCHEMA = { type: "object", additionalProperties: false, properties: {} } as const;
export function parseCopilotDecision(_value: unknown): never { throw new Error("AUTOMATION_NOT_DISTRIBUTED"); }
