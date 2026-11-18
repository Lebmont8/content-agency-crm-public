import type { Copilot } from "@/copilot";
import { type CopilotAction } from "@/copilot/contracts";
import type { TenantDb } from "@/lib/tenant-db";
import { type SalesContext } from "@/sales/context";
import { type AgentToolResult } from "@/sales/tools";
export type SalesOrchestratorResult = {
    runId: string;
    status: "COMPLETED" | "FAILED" | "DUPLICATE";
    actionCount: number;
    errorCode?: string;
};
type ContextBuilder = (tdb: TenantDb, conversationId: string) => Promise<SalesContext>;
type ActionExecutor = (tdb: TenantDb, input: {
    agencyId: string;
    actionId: string;
    action: CopilotAction;
}) => Promise<AgentToolResult>;
export function runSalesOrchestrator(_tdb: TenantDb, _input: {
    agencyId: string;
    inboundEventId: string;
    conversationId: string;
    triggerMessageId: string;
}, _options?: {
    copilot?: Copilot;
    contextBuilder?: ContextBuilder;
    actionExecutor?: ActionExecutor;
    executionMode?: "NORMAL" | "SHADOW";
}): Promise<SalesOrchestratorResult> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export {};
