"use server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { logAudit } from "@/domain/audit";
export async function startShift(): Promise<void> {
    const { user } = await requireAuth();
    const tdb = getTenantDb(user.agencyId);
    const active = await tdb.shift.findFirst({
        where: { userId: user.id, endedAt: null },
    });
    if (active)
        return;
    const shift = await tdb.shift.create({
        data: { agencyId: user.agencyId, userId: user.id },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "shift.start",
        entityType: "Shift",
        entityId: shift.id,
    });
    revalidatePath("/shifts");
}
export async function endShift(): Promise<void> {
    const { user } = await requireAuth();
    const tdb = getTenantDb(user.agencyId);
    const active = await tdb.shift.findFirst({
        where: { userId: user.id, endedAt: null },
        orderBy: { startedAt: "desc" },
    });
    if (!active)
        return;
    const endedAt = new Date();
    const window = { gte: active.startedAt, lte: endedAt };
    await tdb.transaction.updateMany({
        where: { closedByUserId: user.id, occurredAt: window, shiftId: null },
        data: { shiftId: active.id },
    });
    const [agg, ppvClosed, ppvSent] = await Promise.all([
        tdb.transaction.aggregate({
            where: { shiftId: active.id },
            _sum: { amountCents: true },
        }),
        tdb.transaction.count({ where: { shiftId: active.id, type: "PPV" } }),
        tdb.vaultSend.count({
            where: { sentByUserId: user.id, sentAt: window },
        }),
    ]);
    await tdb.shift.update({
        where: { id: active.id },
        data: {
            endedAt,
            revenueCents: agg._sum.amountCents ?? 0,
            ppvClosedCount: ppvClosed,
            ppvSentCount: ppvSent,
        },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "shift.end",
        entityType: "Shift",
        entityId: active.id,
        after: {
            revenueCents: agg._sum.amountCents ?? 0,
            ppvClosed,
            ppvSent,
        },
    });
    revalidatePath("/shifts");
}
