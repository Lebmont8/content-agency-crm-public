import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { completeTelegramNotificationPairing } from "@/notifications/telegram-pairing";
type TelegramUpdate = {
    message?: {
        text?: string;
        chat?: {
            id?: number | string;
        };
    };
};
function equalSecret(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function POST(request: Request, { params }: {
    params: Promise<{
        secret: string;
    }>;
}) {
    const configured = process.env.NOTIFICATION_TELEGRAM_WEBHOOK_SECRET;
    const { secret } = await params;
    if (!configured || !equalSecret(secret, configured)) {
        return NextResponse.json({ ok: false }, { status: 404 });
    }
    if (!rateLimit(`notification-telegram:${request.headers.get("x-forwarded-for") ?? "unknown"}`, 60, 60000).ok) {
        return NextResponse.json({ ok: false }, { status: 429 });
    }
    let update: TelegramUpdate;
    try {
        update = (await request.json()) as TelegramUpdate;
    }
    catch {
        return NextResponse.json({ ok: false }, { status: 400 });
    }
    const text = update.message?.text?.trim() ?? "";
    const chatId = update.message?.chat?.id;
    const match = text.match(/^\/connect\s+([A-F0-9]{10})$/i);
    if (!match || chatId === undefined)
        return NextResponse.json({ ok: true });
    const connected = await completeTelegramNotificationPairing(match[1]!, String(chatId));
    return NextResponse.json({
        method: "sendMessage",
        chat_id: chatId,
        text: connected
            ? "Уведомления CRM подключены. Можно вернуться в настройки."
            : "Код недействителен или уже истёк. Создайте новый код в CRM.",
    });
}
