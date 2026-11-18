import type { FanDTO, MessageDTO, OutgoingMessage, Page, PlatformAccountContext, PlatformAdapter, SendResult, TransactionDTO, VaultItemDTO } from "@/platform/adapter";
const API = "https://api.telegram.org";
export class TelegramAdapter implements PlatformAdapter {
    readonly platform = "telegram";
    private token(): string | null {
        return process.env.TELEGRAM_BOT_TOKEN || null;
    }
    async getFans(): Promise<Page<FanDTO>> {
        return { items: [] };
    }
    async getConversation(): Promise<Page<MessageDTO>> {
        return { items: [] };
    }
    async getTransactions(): Promise<TransactionDTO[]> {
        return [];
    }
    async getVaultItems(): Promise<VaultItemDTO[]> {
        return [];
    }
    async sendMessage(_account: PlatformAccountContext, fanExternalRef: string, payload: OutgoingMessage): Promise<SendResult> {
        const token = this.token();
        if (!token) {
            return {
                ok: false,
                error: "Telegram is not configured",
                errorCode: "TELEGRAM_CONFIG_MISSING",
                failureKind: "PERMANENT",
            };
        }
        try {
            const res = await fetch(`${API}/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ chat_id: fanExternalRef, text: payload.body }),
            });
            const data = (await res.json()) as {
                ok: boolean;
                result?: {
                    message_id: number;
                };
                description?: string;
            };
            if (!data.ok) {
                const retryAfter = res.headers.get("retry-after");
                return {
                    ok: false,
                    error: "Telegram rejected the message",
                    errorCode: `TELEGRAM_HTTP_${res.status}`,
                    failureKind: res.status === 429 || res.status >= 500 ? "RETRYABLE" : "PERMANENT",
                    httpStatus: res.status,
                    retryAfterSeconds: retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined,
                };
            }
            return {
                ok: true,
                externalRef: data.result ? String(data.result.message_id) : undefined,
                sentAt: new Date(),
            };
        }
        catch {
            return {
                ok: false,
                error: "Telegram delivery status is unknown",
                errorCode: "TELEGRAM_NETWORK_UNKNOWN",
                failureKind: "AMBIGUOUS",
            };
        }
    }
}
export const telegramAdapter = new TelegramAdapter();
