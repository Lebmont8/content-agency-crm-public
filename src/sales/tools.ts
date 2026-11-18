import type { TenantDb } from "@/lib/tenant-db";
import { type SalesPolicyCode } from "@/sales/policy";
export type AgentToolResult = {
    status: "QUEUED";
    deliveryId: string;
    messageId: string;
    duplicate: boolean;
} | {
    status: "COMPLETED";
} | {
    status: "REVIEW_REQUIRED";
    reasonCode: SalesPolicyCode;
} | {
    status: "DENIED";
    reasonCode: SalesPolicyCode;
} | {
    status: "DUPLICATE";
    reasonCode?: string | null;
};
export function executeAgentAction(_tdb: TenantDb, _input: {
    agencyId: string;
    actionId: string;
    action: unknown;
    approvedByUserId?: string | null;
}): Promise<AgentToolResult> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
