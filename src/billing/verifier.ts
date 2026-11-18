import "server-only";
import { z } from "zod";
import type { TenantDb } from "@/lib/tenant-db";
import { settleConfirmedCryptoPayment } from "@/billing/settlement";
import { emitNotification } from "@/notifications/service";
const VerificationSchema = z.object({
    status: z.enum(["PENDING", "CONFIRMED", "REJECTED"]),
    txHash: z.string().min(8).max(256),
    asset: z.string().min(2).max(16),
    network: z.string().min(2).max(64),
    toAddress: z.string().min(8).max(256),
    amount: z.string().regex(/^\d+(?:\.\d{1,18})?$/),
    confirmations: z.number().int().min(0).max(1000000),
});
type RuntimeEnv = Readonly<Record<string, string | undefined>>;
function decimalUnits(value: string): bigint | null {
    if (!/^\d+(?:\.\d{1,18})?$/.test(value))
        return null;
    const [whole, fraction = ""] = value.split(".");
    return (BigInt(whole) * BigInt(10) ** BigInt(18) +
        BigInt(fraction.padEnd(18, "0")));
}
function same(value: string, expected: string): boolean {
    return value.trim().toLowerCase() === expected.trim().toLowerCase();
}
export async function verifySubmittedCryptoPayments(tdb: TenantDb, agencyId: string, options: {
    fetchImpl?: typeof fetch;
    env?: RuntimeEnv;
    now?: () => Date;
    limit?: number;
} = {}): Promise<number> {
    const env = options.env ?? process.env;
    const endpoint = env.CRYPTO_VERIFIER_URL?.trim();
    const token = env.CRYPTO_VERIFIER_TOKEN?.trim();
    if (!endpoint || !token)
        return 0;
    const expiredAt = options.now?.() ?? new Date();
    await tdb.cryptoPayment.updateMany({
        where: { status: "CREATED", expiresAt: { lte: expiredAt } },
        data: { status: "EXPIRED", lastErrorCode: "PAYMENT_INTENT_EXPIRED" },
    });
    const payments = await tdb.cryptoPayment.findMany({
        where: {
            status: { in: ["SUBMITTED", "VERIFYING"] },
            txHash: { not: null },
        },
        orderBy: { submittedAt: "asc" },
        take: options.limit ?? 20,
    });
    let confirmed = 0;
    for (const payment of payments) {
        let response: Response;
        try {
            response = await (options.fetchImpl ?? fetch)(endpoint, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    txHash: payment.txHash,
                    asset: payment.asset,
                    network: payment.network,
                }),
                signal: AbortSignal.timeout(10000),
            });
        }
        catch {
            await tdb.cryptoPayment.update({
                where: { id: payment.id },
                data: { status: "VERIFYING", lastErrorCode: "VERIFIER_UNAVAILABLE" },
            });
            continue;
        }
        if (!response.ok) {
            await tdb.cryptoPayment.update({
                where: { id: payment.id },
                data: {
                    status: "VERIFYING",
                    lastErrorCode: `VERIFIER_HTTP_${response.status}`,
                },
            });
            continue;
        }
        const result = VerificationSchema.safeParse(await response.json().catch(() => null));
        if (!result.success) {
            await tdb.cryptoPayment.update({
                where: { id: payment.id },
                data: { status: "VERIFYING", lastErrorCode: "VERIFIER_RESPONSE_INVALID" },
            });
            continue;
        }
        const observed = result.data;
        const expectedUnits = decimalUnits(payment.assetAmount);
        const observedUnits = decimalUnits(observed.amount);
        const mismatch = !same(observed.txHash, payment.txHash ?? "") ||
            !same(observed.asset, payment.asset) ||
            !same(observed.network, payment.network) ||
            !same(observed.toAddress, payment.address) ||
            expectedUnits === null ||
            observedUnits === null ||
            observedUnits < expectedUnits;
        if (observed.status === "REJECTED" || mismatch) {
            await tdb.$transaction([
                tdb.cryptoPayment.update({
                    where: { id: payment.id },
                    data: {
                        status: "REJECTED",
                        confirmations: observed.confirmations,
                        lastErrorCode: mismatch ? "PAYMENT_DETAILS_MISMATCH" : "PAYMENT_REJECTED",
                    },
                }),
                tdb.agency.update({
                    where: { id: agencyId },
                    data: { paymentPending: false },
                }),
            ]);
            await emitNotification(tdb, {
                agencyId,
                type: "BILLING_DUE",
                dedupeKey: `payment:${payment.id}:rejected`,
                title: "Платёж не подтверждён",
                body: "Проверьте сеть, адрес, сумму и хеш транзакции.",
                actionPath: "/billing",
                severity: "CRITICAL",
            });
            continue;
        }
        if (observed.status !== "CONFIRMED" ||
            observed.confirmations < payment.requiredConfirmations) {
            await tdb.cryptoPayment.update({
                where: { id: payment.id },
                data: {
                    status: "VERIFYING",
                    confirmations: observed.confirmations,
                    lastErrorCode: null,
                },
            });
            continue;
        }
        await settleConfirmedCryptoPayment({
            agencyId,
            paymentId: payment.id,
            confirmations: observed.confirmations,
            now: options.now?.() ?? new Date(),
        });
        confirmed += 1;
    }
    return confirmed;
}
