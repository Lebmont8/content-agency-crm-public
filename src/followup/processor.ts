import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import { executeAgentAction } from "@/sales/tools";
type ActionExecutor = typeof executeAgentAction;
export function claimFollowUpJob(_tdb: TenantDb, _jobId: string, _now?: Date, _leaseOwner?: string): Promise<string | null> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function recoverExpiredFollowUps(_tdb: TenantDb, _now?: Date): Promise<number> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function processFollowUpJob(_tdb: TenantDb, _agencyId: string, _jobId: string, _options?: {
    actionExecutor?: ActionExecutor;
    now?: () => Date;
}): Promise<boolean> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function processDueFollowUps(_tdb: TenantDb, _agencyId: string, _limit?: number): Promise<number> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export {};
