import type { TenantDb } from "@/lib/tenant-db";
import { type PilotGateCode } from "@/pilot/policy";
export type AiBudgetDecision = {
    allowed: true;
    usageDate: Date;
} | {
    allowed: false;
    code: PilotGateCode | "DAILY_AI_BUDGET_EXCEEDED";
};
export type AiPreviewBudgetDecision = {
    allowed: true;
    usageDate: Date;
} | {
    allowed: false;
    code: "ACCOUNT_INACTIVE" | "AGENCY_INACTIVE" | "PREVIEW_AI_BUDGET_EXCEEDED";
};
export function reserveRealLlmBudget(_tdb: TenantDb, _input: {
    agencyId: string;
    creatorAccountId: string;
    estimatedCostMicros: number;
    now?: Date;
}): Promise<AiBudgetDecision> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function reserveAiPreviewBudget(_tdb: TenantDb, _input: {
    agencyId: string;
    creatorAccountId: string;
    estimatedCostMicros: number;
    dailyRunLimit: number;
    dailyCostLimitMicros: number;
    now?: Date;
}): Promise<AiPreviewBudgetDecision> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
