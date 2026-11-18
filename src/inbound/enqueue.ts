import { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
export type EnqueueInboundInput = {
    agencyId: string;
    connectionId: string;
    providerEventId: string;
    type: string;
    payload: Prisma.InputJsonValue;
    occurredAt: Date;
};
export type EnqueueInboundResult = {
    eventId: string;
    duplicate: boolean;
};
async function existingEvent(tdb: TenantDb, connectionId: string, providerEventId: string): Promise<EnqueueInboundResult | null> {
    const existing = await tdb.inboundEvent.findUnique({
        where: {
            connectionId_providerEventId: { connectionId, providerEventId },
        },
        select: { id: true },
    });
    return existing ? { eventId: existing.id, duplicate: true } : null;
}
function isUniqueViolation(error: unknown): boolean {
    return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
}
export async function enqueueInboundEvent(tdb: TenantDb, input: EnqueueInboundInput): Promise<EnqueueInboundResult> {
    const duplicate = await existingEvent(tdb, input.connectionId, input.providerEventId);
    if (duplicate)
        return duplicate;
    try {
        const created = await tdb.inboundEvent.create({ data: input });
        return { eventId: created.id, duplicate: false };
    }
    catch (error) {
        if (isUniqueViolation(error)) {
            const raced = await existingEvent(tdb, input.connectionId, input.providerEventId);
            if (raced)
                return raced;
        }
        throw error;
    }
}
