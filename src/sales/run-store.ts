import { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { CopilotProviderTrace } from "@/copilot";
export type AgentActionKindName = "SELECT_OFFER" | "SEND_TEXT" | "SEND_PPV" | "CHECK_PURCHASE" | "UPDATE_SALES_STATE" | "SCHEDULE_FOLLOW_UP" | "CANCEL_FOLLOW_UP" | "HANDOFF_TO_HUMAN";
export type AgentActionStatusName = "PROPOSED" | "APPROVED" | "EXECUTING" | "COMPLETED" | "DENIED" | "FAILED" | "CANCELED";
export function createAgentRun(_tdb: TenantDb, _input: {
    agencyId: string;
    conversationId: string;
    inboundEventId: string;
    triggerMessageId?: string | null;
}): Promise<{
    id: string;
    duplicate: boolean;
}> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function finishAgentRun(_tdb: TenantDb, _input: {
    id: string;
    status: "COMPLETED" | "FAILED";
    decision?: Prisma.InputJsonValue;
    errorCode?: string | null;
    completedAt?: Date;
}): Promise<boolean> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function recordAgentRunDecision(_tdb: TenantDb, _runId: string, _decision: Prisma.InputJsonValue): Promise<boolean> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function recordAgentRunSalesProfileVersion(_tdb: TenantDb, _runId: string, _version: number | null): Promise<boolean> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function recordAgentRunLlmTrace(_tdb: TenantDb, _runId: string, _trace: CopilotProviderTrace, _shadowOnly?: boolean): Promise<boolean> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function createAgentAction(_tdb: TenantDb, _input: {
    agencyId: string;
    agentRunId: string;
    conversationId: string;
    clientRequestId: string;
    kind: AgentActionKindName;
    payload?: Prisma.InputJsonValue;
}): Promise<{
    id: string;
    duplicate: boolean;
}> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function finishAgentAction(_tdb: TenantDb, _input: {
    id: string;
    status: Exclude<AgentActionStatusName, "PROPOSED">;
    result?: Prisma.InputJsonValue;
    reasonCode?: string | null;
    executedAt?: Date;
}): Promise<boolean> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function getTransactionAttributionTrace(_tdb: TenantDb, _transactionId: string): Promise<{
    id: string;
    externalRef: string | null;
    amountCents: number;
    originAgentAction: {
        id: string;
        status: import("@prisma/client").$Enums.AgentActionStatus;
        kind: import("@prisma/client").$Enums.AgentActionKind;
        agentRun: {
            id: string;
            status: import("@prisma/client").$Enums.AgentRunStatus;
            inboundEvent: {
                id: string;
                providerEventId: string;
                type: string;
                occurredAt: Date;
            };
            decision: Prisma.JsonValue;
        };
        clientRequestId: string;
    } | null;
} | null> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
