import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import { paymentState } from "@/domain/commission";
import { emitNotification } from "@/notifications/service";
const DAY_MS = 24 * 60 * 60 * 1000;
export async function emitBillingNotifications(tdb: TenantDb, agencyId: string, now = new Date()): Promise<number> {
    const agency = await tdb.agency.findUnique({
        where: { id: agencyId },
        select: { dueDate: true, paymentPending: true },
    });
    if (!agency?.dueDate || agency.paymentPending)
        return 0;
    const state = paymentState(agency.dueDate, agency.paymentPending, now);
    const dueKey = agency.dueDate.toISOString().slice(0, 10);
    if (state === "blocked") {
        return emitNotification(tdb, {
            agencyId,
            type: "AI_SUSPENDED",
            dedupeKey: `billing:${dueKey}:ai-suspended`,
            title: "ИИ приостановлен из-за неоплаты",
            body: "Ручные сообщения и работа сотрудников остаются доступными. ИИ включится после подтверждения платежа.",
            actionPath: "/billing",
            severity: "CRITICAL",
        });
    }
    if (state === "overdue") {
        return emitNotification(tdb, {
            agencyId,
            type: "BILLING_DUE",
            dedupeKey: `billing:${dueKey}:grace`,
            title: "Оплата CRM просрочена",
            body: "Идёт трёхдневный льготный период. После него автоматический и полуавтоматический ИИ остановятся.",
            actionPath: "/billing",
            severity: "WARNING",
        });
    }
    const daysUntilDue = Math.ceil((agency.dueDate.getTime() - now.getTime()) / DAY_MS);
    if (daysUntilDue > 3)
        return 0;
    return emitNotification(tdb, {
        agencyId,
        type: "BILLING_DUE",
        dedupeKey: `billing:${dueKey}:upcoming`,
        title: "Скоро оплата CRM",
        body: `До оплаты осталось ${Math.max(0, daysUntilDue)} дн.`,
        actionPath: "/billing",
        severity: "WARNING",
    });
}
