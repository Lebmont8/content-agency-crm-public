import "server-only";
import type { TenantDb } from "@/lib/tenant-db";
import { emitNotification } from "@/notifications/service";
const CUSTOM_CONTENT_PATTERN = /\b(custom|personal(?:ized)?|made for me|commission)\b|(?:персональн[а-яё]*|индивидуальн[а-яё]*|на заказ|сними для меня)/i;
export function looksLikeCustomContentRequest(text: string): boolean {
    return CUSTOM_CONTENT_PATTERN.test(text);
}
export async function detectAndCreateContentRequest(tdb: TenantDb, input: {
    agencyId: string;
    creatorAccountId: string;
    conversationId: string;
    sourceMessageId: string;
    messageBody: string;
}): Promise<{
    created: boolean;
    requestId?: string;
}> {
    if (!looksLikeCustomContentRequest(input.messageBody))
        return { created: false };
    const existing = await tdb.contentRequest.findFirst({
        where: { sourceMessageId: input.sourceMessageId },
        select: { id: true },
    });
    if (existing)
        return { created: false, requestId: existing.id };
    const request = await tdb.contentRequest.create({
        data: {
            agencyId: input.agencyId,
            creatorAccountId: input.creatorAccountId,
            conversationId: input.conversationId,
            sourceMessageId: input.sourceMessageId,
            summary: input.messageBody.replace(/\s+/g, " ").trim().slice(0, 500),
        },
    });
    await emitNotification(tdb, {
        agencyId: input.agencyId,
        creatorAccountId: input.creatorAccountId,
        conversationId: input.conversationId,
        type: "CUSTOM_CONTENT_REQUEST",
        dedupeKey: `custom-content:${request.id}`,
        title: "Запрос персонального контента",
        body: request.summary.slice(0, 160),
        actionPath: `/inbox/${input.conversationId}`,
        severity: "WARNING",
    });
    return { created: true, requestId: request.id };
}
