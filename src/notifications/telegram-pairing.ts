import "server-only";
import { db } from "@/lib/db";
import { hashOpaqueToken } from "@/lib/auth-token";
export async function completeTelegramNotificationPairing(code: string, chatId: string): Promise<boolean> {
    const user = await db.user.findFirst({
        where: {
            telegramNotificationPairingHash: hashOpaqueToken(code.toUpperCase()),
            telegramNotificationPairingExpiry: { gt: new Date() },
            isActive: true,
        },
        select: { id: true, agencyId: true },
    });
    if (!user)
        return false;
    const updated = await db.user.updateMany({
        where: {
            id: user.id,
            agencyId: user.agencyId,
            telegramNotificationPairingHash: hashOpaqueToken(code.toUpperCase()),
            telegramNotificationPairingExpiry: { gt: new Date() },
        },
        data: {
            telegramNotificationChatId: chatId,
            telegramNotificationVerifiedAt: new Date(),
            telegramNotificationPairingHash: null,
            telegramNotificationPairingExpiry: null,
        },
    });
    return updated.count === 1;
}
