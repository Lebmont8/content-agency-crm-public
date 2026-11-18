import { getTenantDb } from "@/lib/tenant-db";
import { buildMonthlyInvoice, billingPeriodBounds, paymentState, type MonthlyInvoice, type PaymentState } from "@/domain/commission";
export interface AgencyBilling {
    invoice: MonthlyInvoice;
    state: PaymentState;
    dueDate: Date | null;
}
export async function getAgencyBilling(agencyId: string, at: Date = new Date()): Promise<AgencyBilling> {
    const tdb = getTenantDb(agencyId);
    const agency = await tdb.agency.findFirstOrThrow();
    const { start, end } = billingPeriodBounds(agency.dueDate, at);
    const [activeModels, pendingModels, grouped] = await Promise.all([
        tdb.creatorAccount.count({ where: { activated: true } }),
        tdb.creatorAccount.count({ where: { activated: false } }),
        tdb.transaction.groupBy({
            by: ["aiMode"],
            where: {
                aiMode: { in: ["ASSIST", "AUTO"] },
                occurredAt: { gte: start, lte: end },
            },
            _sum: { amountCents: true },
            _count: { _all: true },
        }),
    ]);
    const line = (mode: "ASSIST" | "AUTO") => {
        const row = grouped.find((g) => g.aiMode === mode);
        return { cents: row?._sum.amountCents ?? 0, count: row?._count._all ?? 0 };
    };
    const assist = line("ASSIST");
    const auto = line("AUTO");
    const invoice = buildMonthlyInvoice({
        periodStart: start,
        periodEnd: end,
        assistSalesCents: assist.cents,
        assistSalesCount: assist.count,
        autoSalesCents: auto.cents,
        autoSalesCount: auto.count,
        assistPercent: agency.commissionAssistPercent,
        autoPercent: agency.commissionAutoPercent,
        perModelFeeCents: agency.perModelFeeCents,
        activeModels,
        pendingModels,
    });
    return {
        invoice,
        state: paymentState(agency.dueDate, agency.paymentPending, at),
        dueDate: agency.dueDate,
    };
}
