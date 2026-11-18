export const DEFAULT_ASSIST_PERCENT = 7;
export const DEFAULT_AUTO_PERCENT = 9;
export const DEFAULT_PER_MODEL_FEE_CENTS = 5000;
export const BILLING_PERIOD_DAYS = 14;
export const GRACE_DAYS = 3;
export function commissionCents(salesCents: number, percent: number): number {
    if (salesCents <= 0 || percent <= 0)
        return 0;
    return Math.round((salesCents * percent) / 100);
}
export interface CommissionLine {
    salesCents: number;
    salesCount: number;
    ratePercent: number;
    commissionCents: number;
}
export interface MonthlyInvoice {
    periodStart: Date;
    periodEnd: Date;
    assist: CommissionLine;
    auto: CommissionLine;
    commissionCents: number;
    activeModels: number;
    perModelFeeCents: number;
    fixedFeeCents: number;
    totalDueCents: number;
    pendingModels: number;
    activationDueCents: number;
}
export function buildMonthlyInvoice(input: {
    periodStart: Date;
    periodEnd: Date;
    assistSalesCents: number;
    assistSalesCount: number;
    autoSalesCents: number;
    autoSalesCount: number;
    assistPercent: number;
    autoPercent: number;
    perModelFeeCents: number;
    activeModels: number;
    pendingModels: number;
}): MonthlyInvoice {
    const assist: CommissionLine = {
        salesCents: input.assistSalesCents,
        salesCount: input.assistSalesCount,
        ratePercent: input.assistPercent,
        commissionCents: commissionCents(input.assistSalesCents, input.assistPercent),
    };
    const auto: CommissionLine = {
        salesCents: input.autoSalesCents,
        salesCount: input.autoSalesCount,
        ratePercent: input.autoPercent,
        commissionCents: commissionCents(input.autoSalesCents, input.autoPercent),
    };
    const commission = assist.commissionCents + auto.commissionCents;
    const fixedFeeCents = input.activeModels * input.perModelFeeCents;
    return {
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        assist,
        auto,
        commissionCents: commission,
        activeModels: input.activeModels,
        perModelFeeCents: input.perModelFeeCents,
        fixedFeeCents,
        totalDueCents: fixedFeeCents + commission,
        pendingModels: input.pendingModels,
        activationDueCents: input.pendingModels * input.perModelFeeCents,
    };
}
export type PaymentState = "ok" | "overdue" | "blocked" | "pending_confirm";
export function paymentState(dueDate: Date | null | undefined, paymentPending: boolean, now: Date = new Date()): PaymentState {
    if (paymentPending)
        return "pending_confirm";
    if (!dueDate)
        return "ok";
    const grace = new Date(dueDate.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    if (now > grace)
        return "blocked";
    if (now > dueDate)
        return "overdue";
    return "ok";
}
export function monthBounds(d: Date = new Date()): {
    start: Date;
    end: Date;
} {
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}
export function billingPeriodBounds(dueDate: Date | null | undefined, now: Date = new Date()): {
    start: Date;
    end: Date;
} {
    const periodMs = BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    const end = dueDate && dueDate > new Date(now.getTime() - periodMs)
        ? new Date(dueDate)
        : new Date(now);
    return { start: new Date(end.getTime() - periodMs), end };
}
export type AiBillingGate = {
    allowed: true;
} | {
    allowed: false;
    code: "AGENCY_SUSPENDED" | "AI_PAYMENT_OVERDUE";
};
export function evaluateAiBillingGate(input: {
    agencyStatus: string;
    dueDate: Date | null | undefined;
    paymentPending: boolean;
}, now: Date = new Date()): AiBillingGate {
    if (input.agencyStatus === "SUSPENDED") {
        return { allowed: false, code: "AGENCY_SUSPENDED" };
    }
    return paymentState(input.dueDate, input.paymentPending, now) === "blocked"
        ? { allowed: false, code: "AI_PAYMENT_OVERDUE" }
        : { allowed: true };
}
