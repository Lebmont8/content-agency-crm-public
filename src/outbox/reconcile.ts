import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import type { MessageDTO } from "@/platform/adapter";
const MATCH_WINDOW_MS = 10 * 60 * 1000;
export async function reconcileAmbiguousOutbound(tdb: TenantDb, agencyId: string, conversationId: string, dto: MessageDTO): Promise<boolean> {
    if (dto.direction !== "out")
        return false;
    const candidates = await tdb.outboundDelivery.findMany({
        where: {
            agencyId,
            conversationId,
            status: "CONFIRMING",
            createdAt: {
                gte: new Date(dto.sentAt.getTime() - MATCH_WINDOW_MS),
                lte: new Date(dto.sentAt.getTime() + MATCH_WINDOW_MS),
            },
            message: { body: dto.body },
            vaultSend: dto.ppv
                ? {
                    is: {
                        priceCents: dto.ppv.priceCents,
                        vaultItem: {
                            is: { externalRef: dto.ppv.vaultItemExternalRef },
                        },
                    },
                }
                : { is: null },
        },
        select: { id: true, messageId: true, vaultSendId: true },
        take: 2,
    });
    if (candidates.length !== 1)
        return false;
    const [candidate] = candidates;
    await tdb.$transaction([
        tdb.outboundDelivery.update({
            where: { id: candidate.id },
            data: {
                status: "SENT",
                providerExternalRef: dto.externalRef,
                sentAt: dto.sentAt,
                lastErrorCode: null,
                lastErrorAt: null,
            },
        }),
        tdb.message.update({
            where: { id: candidate.messageId },
            data: { externalRef: dto.externalRef, sentAt: dto.sentAt },
        }),
        ...(candidate.vaultSendId
            ? [
                tdb.vaultSend.update({
                    where: { id: candidate.vaultSendId },
                    data: {
                        sentAt: dto.sentAt,
                        purchasedAt: dto.ppv?.purchased ? dto.sentAt : undefined,
                    },
                }),
            ]
            : []),
        tdb.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: dto.sentAt },
        }),
    ]);
    return true;
}
