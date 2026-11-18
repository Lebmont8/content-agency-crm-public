import "server-only";
import { db } from "@/lib/db";
import { logAudit } from "@/domain/audit";
import { BILLING_PERIOD_DAYS } from "@/domain/commission";
const DAY_MS = 24 * 60 * 60 * 1000;
export async function settleConfirmedCryptoPayment(input: {
    agencyId: string;
    paymentId: string;
    confirmations: number;
    actorId?: string | null;
    now?: Date;
}): Promise<{
    activatedModels: number;
    nextDue: Date;
}> {
    const now = input.now ?? new Date();
    const payment = await db.cryptoPayment.findFirst({
        where: {
            id: input.paymentId,
            agencyId: input.agencyId,
            status: { in: ["SUBMITTED", "VERIFYING"] },
        },
        include: { billingRecord: true, agency: { select: { dueDate: true } } },
    });
    if (!payment?.billingRecordId || !payment.txHash) {
        throw new Error("PAYMENT_NOT_READY_FOR_CONFIRMATION");
    }
    const baseDue = payment.agency.dueDate && payment.agency.dueDate > now
        ? payment.agency.dueDate
        : now;
    const nextDue = new Date(baseDue.getTime() + BILLING_PERIOD_DAYS * DAY_MS);
    const [, activated] = await db.$transaction([
        db.cryptoPayment.update({
            where: { id: payment.id },
            data: {
                status: "CONFIRMED",
                confirmations: Math.max(payment.requiredConfirmations, input.confirmations),
                confirmedAt: now,
                lastErrorCode: null,
            },
        }),
        db.creatorAccount.updateMany({
            where: { agencyId: input.agencyId, activated: false },
            data: { activated: true },
        }),
        db.billingRecord.update({
            where: { id: payment.billingRecordId },
            data: {
                status: "PAID",
                paidAt: now,
                currency: payment.asset,
                network: payment.network,
                txHash: payment.txHash,
            },
        }),
        db.agency.update({
            where: { id: input.agencyId },
            data: { paymentPending: false, dueDate: nextDue },
        }),
    ]);
    await logAudit(db, input.agencyId, {
        actorId: input.actorId ?? null,
        action: "billing.payment.confirm",
        entityType: "CryptoPayment",
        entityId: payment.id,
        after: {
            billingRecordId: payment.billingRecordId,
            activatedModels: activated.count,
            confirmations: Math.max(payment.requiredConfirmations, input.confirmations),
            nextDue: nextDue.toISOString(),
            verification: input.actorId ? "operator" : "automatic",
        },
    });
    return { activatedModels: activated.count, nextDue };
}
