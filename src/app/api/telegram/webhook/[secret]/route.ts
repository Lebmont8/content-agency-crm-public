import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant-db";
import { resolveTelegramAccount } from "@/lib/telegram";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeFanText } from "@/copilot";
import { autoReply } from "@/domain/auto-reply";
import { detectAndCreateContentRequest } from "@/notifications/content-request";
import { verifyTelegramWebhookSecret } from "@/lib/telegram-webhook-secret";
type TelegramUpdate = {
    message?: {
        text?: string;
        chat: {
            id: number;
        };
        from?: {
            first_name?: string;
            username?: string;
        };
    };
};
export async function POST(req: Request, { params }: {
    params: Promise<{
        secret: string;
    }>;
}) {
    const { secret } = await params;
    const headerToken = req.headers.get("x-telegram-bot-api-secret-token");
    if (!verifyTelegramWebhookSecret(process.env.TELEGRAM_WEBHOOK_SECRET, headerToken)) {
        return NextResponse.json({ ok: false }, { status: 404 });
    }
    const clientIp = req.headers.get("cf-connecting-ip")?.trim() ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
    if (!rateLimit(`tg-ip:${clientIp}`, 60, 60000).ok) {
        return NextResponse.json({ ok: false }, { status: 429 });
    }
    const account = await resolveTelegramAccount(secret);
    if (!account)
        return NextResponse.json({ ok: false }, { status: 404 });
    if (!rateLimit(`tg:${account.accountId}`, 120, 60000).ok) {
        return NextResponse.json({ ok: false }, { status: 429 });
    }
    let update: TelegramUpdate;
    try {
        update = (await req.json()) as TelegramUpdate;
    }
    catch {
        return NextResponse.json({ ok: false }, { status: 400 });
    }
    const msg = update.message;
    if (!msg?.text)
        return NextResponse.json({ ok: true });
    const chatId = String(msg.chat.id);
    const text = sanitizeFanText(msg.text);
    if (!text)
        return NextResponse.json({ ok: true });
    const displayName = msg.from?.first_name || msg.from?.username || `tg_${chatId}`;
    const username = msg.from?.username || `tg_${chatId}`;
    const tdb = getTenantDb(account.agencyId);
    const fan = await tdb.fan.upsert({
        where: {
            creatorAccountId_externalFanRef: {
                creatorAccountId: account.accountId,
                externalFanRef: chatId,
            },
        },
        create: {
            agencyId: account.agencyId,
            creatorAccountId: account.accountId,
            externalFanRef: chatId,
            username,
            displayName,
            subscribedAt: new Date(),
            lastActiveAt: new Date(),
        },
        update: { lastActiveAt: new Date() },
    });
    const conversation = await tdb.conversation.upsert({
        where: {
            creatorAccountId_fanId: {
                creatorAccountId: account.accountId,
                fanId: fan.id,
            },
        },
        create: {
            agencyId: account.agencyId,
            creatorAccountId: account.accountId,
            fanId: fan.id,
        },
        update: {},
    });
    const message = await tdb.message.create({
        data: {
            agencyId: account.agencyId,
            conversationId: conversation.id,
            direction: "IN",
            body: text,
            externalRef: `tg:${chatId}:${Date.now()}`,
        },
    });
    await tdb.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
    });
    await detectAndCreateContentRequest(tdb, {
        agencyId: account.agencyId,
        creatorAccountId: account.accountId,
        conversationId: conversation.id,
        sourceMessageId: message.id,
        messageBody: text,
    });
    if (account.aiAutoReply) {
        await autoReply(tdb, account.agencyId, conversation.id);
    }
    return NextResponse.json({ ok: true });
}
