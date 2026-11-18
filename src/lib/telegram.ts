import "server-only";
import { db } from "@/lib/db";
export async function resolveTelegramAccount(secret: string): Promise<{
    agencyId: string;
    accountId: string;
    aiAutoReply: boolean;
} | null> {
    if (!secret)
        return null;
    const account = await db.creatorAccount.findFirst({
        where: { platform: "telegram", externalAccountRef: secret, status: "ACTIVE" },
        select: { id: true, agencyId: true, aiAutoReply: true },
    });
    if (!account)
        return null;
    return {
        agencyId: account.agencyId,
        accountId: account.id,
        aiAutoReply: account.aiAutoReply,
    };
}
