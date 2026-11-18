export interface TxLike {
    amountCents: number;
    type: "SUBSCRIPTION" | "PPV" | "TIP";
}
export interface SendLike {
    purchasedAt: Date | null;
}
export interface Kpi {
    revenueCents: number;
    ppvRevenueCents: number;
    tipRevenueCents: number;
    subscriptionRevenueCents: number;
    ppvClosed: number;
    ppvSent: number;
    conversionPct: number;
    avgPpvCheckCents: number;
}
export function computeKpi(transactions: TxLike[], sends: SendLike[]): Kpi {
    let revenueCents = 0;
    let ppvRevenueCents = 0;
    let tipRevenueCents = 0;
    let subscriptionRevenueCents = 0;
    let ppvClosed = 0;
    for (const tx of transactions) {
        revenueCents += tx.amountCents;
        if (tx.type === "PPV") {
            ppvRevenueCents += tx.amountCents;
            ppvClosed++;
        }
        else if (tx.type === "TIP") {
            tipRevenueCents += tx.amountCents;
        }
        else {
            subscriptionRevenueCents += tx.amountCents;
        }
    }
    const ppvSent = sends.length;
    const purchased = sends.filter((s) => s.purchasedAt != null).length;
    return {
        revenueCents,
        ppvRevenueCents,
        tipRevenueCents,
        subscriptionRevenueCents,
        ppvClosed,
        ppvSent,
        conversionPct: ppvSent === 0 ? 0 : Math.round((purchased / ppvSent) * 100),
        avgPpvCheckCents: ppvClosed === 0 ? 0 : Math.round(ppvRevenueCents / ppvClosed),
    };
}
export type Period = "day" | "week" | "month";
export function periodStart(period: Period, now: Date = new Date()): Date {
    const DAY = 24 * 60 * 60 * 1000;
    switch (period) {
        case "day":
            return new Date(now.getTime() - DAY);
        case "week":
            return new Date(now.getTime() - 7 * DAY);
        case "month":
            return new Date(now.getTime() - 30 * DAY);
    }
}
