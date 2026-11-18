"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { assertCan } from "@/auth/permissions";
import { logAudit } from "@/domain/audit";
import { getAgencyBilling } from "@/domain/billing-query";
import { GRACE_DAYS } from "@/domain/commission";
import { configuredCryptoRails, stablecoinAmount } from "@/billing/crypto-rails";
import type { ActionState } from "@/app/(auth)/actions";
export async function createCryptoPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user, agency } = await requireAuth();
    assertCan(user.role, "billing.manage");
    const railId = z.string().min(1).safeParse(formData.get("railId"));
    if (!railId.success)
        return { error: "Choose a cryptocurrency and network" };
    const rail = configuredCryptoRails().find((candidate) => candidate.id === railId.data);
    if (!rail)
        return { error: "This payment option is not configured" };
    const billing = await getAgencyBilling(user.agencyId);
    const amountCents = billing.invoice.totalDueCents + billing.invoice.activationDueCents;
    if (amountCents <= 0)
        return { error: "There is nothing to pay" };
    const tdb = getTenantDb(user.agencyId);
    const dueAt = agency.dueDate ?? billing.invoice.periodEnd;
    const graceEndsAt = new Date(dueAt.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    const lineItems = {
        fixedFeeCents: billing.invoice.fixedFeeCents,
        assistCommissionCents: billing.invoice.assist.commissionCents,
        autoCommissionCents: billing.invoice.auto.commissionCents,
        activationDueCents: billing.invoice.activationDueCents,
        activeModels: billing.invoice.activeModels,
        pendingModels: billing.invoice.pendingModels,
    } satisfies Prisma.InputJsonValue;
    const record = await tdb.billingRecord.upsert({
        where: {
            agencyId_periodStart_periodEnd: {
                agencyId: user.agencyId,
                periodStart: billing.invoice.periodStart,
                periodEnd: billing.invoice.periodEnd,
            },
        },
        create: {
            agencyId: user.agencyId,
            periodStart: billing.invoice.periodStart,
            periodEnd: billing.invoice.periodEnd,
            amountCents,
            lineItems,
            status: "INVOICED",
            dueAt,
            graceEndsAt,
            currency: rail.asset,
            network: rail.network,
        },
        update: {
            amountCents,
            lineItems,
            status: "INVOICED",
            dueAt,
            graceEndsAt,
            currency: rail.asset,
            network: rail.network,
        },
    });
    await tdb.cryptoPayment.updateMany({
        where: { billingRecordId: record.id, status: "CREATED" },
        data: { status: "EXPIRED" },
    });
    const payment = await tdb.cryptoPayment.create({
        data: {
            agencyId: user.agencyId,
            billingRecordId: record.id,
            asset: rail.asset,
            network: rail.network,
            address: rail.address,
            amountCents,
            assetAmount: stablecoinAmount(amountCents),
            requiredConfirmations: rail.requiredConfirmations,
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "billing.invoice.create",
        entityType: "CryptoPayment",
        entityId: payment.id,
        after: {
            billingRecordId: record.id,
            asset: rail.asset,
            network: rail.network,
            amountCents,
            requiredConfirmations: rail.requiredConfirmations,
        },
    });
    revalidatePath("/billing");
    return null;
}
export async function submitCryptoPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user } = await requireAuth();
    assertCan(user.role, "billing.manage");
    const parsed = z.object({
        paymentId: z.string().min(1),
        txHash: z.string().trim().regex(/^[A-Za-z0-9:_-]{16,200}$/),
    }).safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: "Enter a valid transaction hash" };
    const tdb = getTenantDb(user.agencyId);
    const payment = await tdb.cryptoPayment.findUnique({ where: { id: parsed.data.paymentId } });
    if (!payment || payment.status !== "CREATED" || payment.expiresAt <= new Date()) {
        return { error: "This payment request expired. Create a new one" };
    }
    const duplicate = await tdb.cryptoPayment.findFirst({
        where: { network: payment.network, txHash: parsed.data.txHash },
        select: { id: true },
    });
    if (duplicate)
        return { error: "This transaction is already being checked" };
    await tdb.$transaction([
        tdb.cryptoPayment.update({
            where: { id: payment.id },
            data: {
                txHash: parsed.data.txHash,
                status: "SUBMITTED",
                submittedAt: new Date(),
            },
        }),
        ...(payment.billingRecordId
            ? [
                tdb.billingRecord.update({
                    where: { id: payment.billingRecordId },
                    data: { txHash: parsed.data.txHash, network: payment.network },
                }),
            ]
            : []),
        tdb.agency.update({
            where: { id: user.agencyId },
            data: { paymentPending: true },
        }),
    ]);
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "billing.payment.claim",
        entityType: "CryptoPayment",
        entityId: payment.id,
        after: { network: payment.network, txHashProvided: true },
    });
    revalidatePath("/billing");
    return null;
}
