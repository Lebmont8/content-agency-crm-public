import { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { SalesStageName } from "@/sales/state";
export type SalesEventTypeName = "STAGE_CHANGED" | "OFFER_SELECTED" | "OFFER_SENT" | "OBJECTION_RECORDED" | "HANDOFF" | "PURCHASED" | "LOST";
export function recordSalesEvent(_tdb: TenantDb, _input: {
    agencyId: string;
    conversationId: string;
    dedupeKey: string;
    type: SalesEventTypeName;
    agentRunId?: string | null;
    agentActionId?: string | null;
    stageFrom?: SalesStageName | null;
    stageTo?: SalesStageName | null;
    metadata?: Prisma.InputJsonValue;
    occurredAt?: Date;
}): Promise<{
    id: string;
    duplicate: boolean;
}> {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
