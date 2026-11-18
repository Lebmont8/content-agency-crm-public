import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import { emitNotification } from "@/notifications/service";
export const LARGE_PURCHASE_CENTS = 10000;
export async function notifyNewLead(tdb: TenantDb, input: {
    agencyId: string;
    creatorAccountId: string;
    fanId: string;
    displayName: string;
}): Promise<number> {
    try {
        return await emitNotification(tdb, {
            agencyId: input.agencyId,
            creatorAccountId: input.creatorAccountId,
            type: "NEW_LEAD",
            dedupeKey: `new-lead:${input.fanId}`,
            title: "Новый лид",
            body: input.displayName,
            actionPath: `/fans/${input.fanId}`,
            severity: "INFO",
        });
    }
    catch {
        return 0;
    }
}
export async function notifyLargePurchase(tdb: TenantDb, input: {
    agencyId: string;
    creatorAccountId: string;
    transactionId: string;
    fanId: string;
    amountCents: number;
    conversationId?: string | null;
}): Promise<number> {
    if (input.amountCents < LARGE_PURCHASE_CENTS)
        return 0;
    try {
        return await emitNotification(tdb, {
            agencyId: input.agencyId,
            creatorAccountId: input.creatorAccountId,
            conversationId: input.conversationId ?? null,
            type: "LARGE_PURCHASE",
            dedupeKey: `large-purchase:${input.transactionId}`,
            title: "Крупная покупка",
            body: `Сумма: $${(input.amountCents / 100).toFixed(2)}`,
            actionPath: input.conversationId
                ? `/inbox/${input.conversationId}`
                : `/fans/${input.fanId}`,
            severity: "INFO",
        });
    }
    catch {
        return 0;
    }
}
