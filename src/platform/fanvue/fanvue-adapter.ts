import { z } from "zod";
import type { FanDTO, MessageDTO, OutgoingMessage, Page, PlatformAccountContext, PlatformAdapter, SendResult, TransactionDTO, VaultItemDTO } from "@/platform/adapter";
import { FanvueApiError, fanvueRequest } from "@/platform/fanvue/client";
import { isFanvueLiveSalesEnabled } from "@/platform/fanvue/oauth";
const fanSchema = z.object({
    uuid: z.string().min(1),
    handle: z.string().optional(),
    nickname: z.string().optional(),
    displayName: z.string().optional(),
    firstSubscribedAt: z.string().nullish(),
    subscribedAt: z.string().nullish(),
    registeredAt: z.string().nullish(),
    lastSeenAt: z.string().nullish(),
    isActive: z.boolean().optional(),
    isSubscribed: z.boolean().optional(),
    subscriptionStatus: z.string().optional(),
    subscription: z.object({
        status: z.string().min(1),
        currentPeriodStart: z.string().nullish(),
    }).passthrough().optional(),
}).passthrough();
const messageSchema = z.object({
    uuid: z.string().min(1),
    text: z.string().nullish(),
    sentAt: z.string().nullish(),
    createdAt: z.string().nullish(),
    direction: z.string().optional(),
    sender: z.object({ uuid: z.string().min(1) }).passthrough().optional(),
    senderUuid: z.string().optional(),
    sentByUserId: z.string().optional(),
    isFromCreator: z.boolean().optional(),
    mediaUuids: z.array(z.string().min(1)).optional(),
    pricing: z.record(z.string(), z.object({ price: z.number().int().nonnegative() }).passthrough()).nullish(),
    purchasedAt: z.string().datetime({ offset: true }).nullish(),
}).passthrough();
const mediaSchema = z.object({
    uuid: z.string().min(1),
    status: z.string().min(1),
    caption: z.string().nullish(),
    description: z.string().nullish(),
    name: z.string().nullish(),
    mediaType: z.enum(["image", "video", "audio", "document"]).optional(),
    recommendedPrice: z.number().int().nonnegative().nullish(),
    tags: z.object({
        tags: z.array(z.string()).optional(),
        importantTags: z.array(z.string()).optional(),
    }).passthrough().nullish(),
}).passthrough();
const sendResponseSchema = z.object({
    messageUuid: z.string().min(1),
}).passthrough();
const FANVUE_EARNINGS_RECONCILIATION_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const earningSchema = z.object({
    date: z.string().datetime({ offset: true }),
    gross: z.number().int().positive(),
    currency: z.string().length(3),
    source: z.enum([
        "message",
        "post",
        "media",
        "tip",
        "subscription",
        "renewal",
    ]),
    transactionOrderId: z.string().min(1),
    messageUuid: z.string().min(1).nullish(),
    user: z.object({
        uuid: z.string().min(1),
        handle: z.string().min(1).nullish(),
        nickname: z.string().min(1).nullish(),
        displayName: z.string().min(1).nullish(),
    }).passthrough(),
}).passthrough();
function pageItems<T>(input: unknown, itemSchema: z.ZodType<T>): {
    items: T[];
    nextCursor?: string;
    page?: number;
    hasMore?: boolean;
} {
    const root = z.record(z.string(), z.unknown()).parse(input);
    const data = root.data;
    let rawItems: unknown = data;
    const pagination = root.pagination && typeof root.pagination === "object"
        ? (root.pagination as Record<string, unknown>)
        : null;
    let nextCursor = root.nextCursor ?? root.nextPage ?? pagination?.nextCursor;
    if (data && typeof data === "object" && !Array.isArray(data)) {
        const record = data as Record<string, unknown>;
        rawItems = record.items ?? record.data;
        nextCursor = record.nextCursor ?? record.nextPage ?? nextCursor;
    }
    const items = z.array(itemSchema).parse(rawItems ?? []);
    return {
        items,
        nextCursor: typeof nextCursor === "string" && nextCursor ? nextCursor : undefined,
        page: typeof pagination?.page === "number" &&
            Number.isInteger(pagination.page)
            ? pagination.page
            : undefined,
        hasMore: typeof pagination?.hasMore === "boolean"
            ? pagination.hasMore
            : undefined,
    };
}
function responseData(input: unknown): unknown {
    if (input && typeof input === "object" && "data" in input) {
        return (input as {
            data: unknown;
        }).data;
    }
    return input;
}
function dateOr(value: string | null | undefined, fallback: Date): Date {
    if (!value)
        return fallback;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
function paginatedPath(path: string, cursor?: string): string {
    const url = new URL(path, "https://api.fanvue.com");
    url.searchParams.set("size", "50");
    if (cursor)
        url.searchParams.set("cursor", cursor);
    return `${url.pathname}${url.search}`;
}
export class FanvueAdapter implements PlatformAdapter {
    readonly platform = "fanvue";
    async getFans(account: PlatformAccountContext, cursor?: string): Promise<Page<FanDTO>> {
        const page = pageItems(await fanvueRequest(account, paginatedPath("/subscribers", cursor)), fanSchema);
        return {
            items: page.items.map((fan) => {
                const subscribedAt = dateOr(fan.firstSubscribedAt ??
                    fan.subscribedAt ??
                    fan.subscription?.currentPeriodStart ??
                    fan.registeredAt, new Date(0));
                const subscriptionStatus = fan.subscription?.status ?? fan.subscriptionStatus;
                return {
                    externalFanRef: fan.uuid,
                    username: fan.handle ?? fan.nickname ?? fan.uuid,
                    displayName: fan.displayName ?? fan.nickname ?? fan.handle ?? fan.uuid,
                    subscribedAt,
                    lastActiveAt: dateOr(fan.lastSeenAt, subscribedAt),
                    subscriptionStatus: fan.isActive === false ||
                        fan.isSubscribed === false ||
                        ["cancelled", "expired", "inactive"].includes(subscriptionStatus?.toLowerCase() ?? "")
                        ? "expired"
                        : "active",
                };
            }),
            nextCursor: page.nextCursor,
        };
    }
    async getConversation(account: PlatformAccountContext, fanExternalRef: string, cursor?: string): Promise<Page<MessageDTO>> {
        const beforeMessageUuid = cursor?.startsWith("before:")
            ? cursor.slice("before:".length)
            : null;
        if (cursor && (!beforeMessageUuid || beforeMessageUuid.length > 240)) {
            throw new Error("Fanvue message pagination cursor is invalid");
        }
        const base = `/chats/${encodeURIComponent(fanExternalRef)}/messages`;
        const path = new URL(base, "https://api.fanvue.com");
        path.searchParams.set("size", "50");
        path.searchParams.set("markAsRead", "false");
        if (beforeMessageUuid) {
            path.searchParams.set("beforeMessageUuid", beforeMessageUuid);
        }
        const page = pageItems(await fanvueRequest(account, `${path.pathname}${path.search}`), messageSchema);
        const nextAnchor = page.items.at(-1)?.uuid;
        if (page.hasMore === true && !nextAnchor) {
            throw new Error("Fanvue message pagination is invalid");
        }
        return {
            items: page.items.map((message) => {
                const sender = message.sender?.uuid ?? message.sentByUserId ?? message.senderUuid;
                const outgoing = message.direction === "outgoing" ||
                    message.isFromCreator === true ||
                    (!!sender && sender === account.remoteAccountId);
                const priceCents = message.pricing?.USD?.price;
                const vaultItemExternalRef = message.mediaUuids?.[0];
                const sentAt = dateOr(message.sentAt ?? message.createdAt, new Date(0));
                return {
                    externalRef: message.uuid,
                    direction: outgoing ? "out" : "in",
                    body: message.text ?? "",
                    sentAt,
                    ...(priceCents !== undefined && vaultItemExternalRef
                        ? {
                            ppv: {
                                vaultItemExternalRef,
                                priceCents,
                                purchased: Boolean(message.purchasedAt),
                                ...(message.purchasedAt
                                    ? { purchasedAt: dateOr(message.purchasedAt, sentAt) }
                                    : {}),
                            },
                        }
                        : {}),
                };
            }),
            nextCursor: page.hasMore === true
                ? `before:${nextAnchor}`
                : page.nextCursor,
        };
    }
    async getTransactions(account: PlatformAccountContext, since?: Date): Promise<TransactionDTO[]> {
        if (!account.grantedScopes.includes("read:insights"))
            return [];
        const result: TransactionDTO[] = [];
        let cursor: string | undefined;
        for (let page = 1; page <= 250; page++) {
            const path = new URL("/insights/earnings", "https://api.fanvue.com");
            path.searchParams.set("size", "50");
            path.searchParams.set("source", "message,post,media,tip,subscription,renewal");
            if (since) {
                if (Number.isNaN(since.getTime())) {
                    throw new Error("Fanvue earnings reconciliation date is invalid");
                }
                path.searchParams.set("startDate", new Date(since.getTime() - FANVUE_EARNINGS_RECONCILIATION_LOOKBACK_MS).toISOString());
            }
            if (cursor)
                path.searchParams.set("cursor", cursor);
            const response = pageItems(await fanvueRequest(account, `${path.pathname}${path.search}`), earningSchema);
            for (const earning of response.items) {
                if (earning.currency.toUpperCase() !== "USD") {
                    throw new Error("Fanvue earnings currency is unsupported");
                }
                result.push({
                    externalRef: earning.transactionOrderId,
                    fanExternalRef: earning.user.uuid,
                    fanUsername: earning.user.handle ?? earning.user.nickname ?? earning.user.uuid,
                    fanDisplayName: earning.user.displayName ??
                        earning.user.nickname ??
                        earning.user.handle ??
                        earning.user.uuid,
                    type: earning.source === "subscription" || earning.source === "renewal"
                        ? "subscription"
                        : earning.source === "tip"
                            ? "tip"
                            : "ppv",
                    amountCents: earning.gross,
                    occurredAt: new Date(earning.date),
                    currency: "USD",
                    ...(earning.source === "message" && earning.messageUuid
                        ? { providerMessageRef: earning.messageUuid }
                        : {}),
                });
            }
            cursor = response.nextCursor;
            if (!cursor)
                return result;
        }
        throw new Error("Fanvue earnings pagination exceeded the safety limit");
    }
    async getVaultItems(account: PlatformAccountContext): Promise<VaultItemDTO[]> {
        if (!account.grantedScopes.includes("read:media"))
            return [];
        const result: VaultItemDTO[] = [];
        for (let page = 1; page <= 250; page++) {
            const path = new URL("/media", "https://api.fanvue.com");
            path.searchParams.set("page", String(page));
            path.searchParams.set("size", "50");
            path.searchParams.set("status", "ready");
            const root = z.record(z.string(), z.unknown()).parse(await fanvueRequest(account, `${path.pathname}${path.search}`));
            const items = z.array(mediaSchema).parse(root.data ?? []);
            for (const item of items) {
                if (item.status.toLowerCase() !== "ready" || !item.mediaType)
                    continue;
                const tags = [
                    ...(item.tags?.importantTags ?? []),
                    ...(item.tags?.tags ?? []),
                ];
                result.push({
                    externalRef: item.uuid,
                    title: item.caption ?? item.name ?? item.description ?? item.uuid,
                    mediaType: item.mediaType === "image"
                        ? "photo"
                        : item.mediaType === "document"
                            ? "bundle"
                            : item.mediaType,
                    defaultPriceCents: Math.min(50000, Math.max(300, item.recommendedPrice ?? 300)),
                    tags: [...new Set(tags)].slice(0, 50),
                });
            }
            const pagination = z.object({
                page: z.number().int().positive(),
                hasMore: z.boolean(),
            }).passthrough().parse(root.pagination);
            if (!pagination.hasMore)
                return result;
            if (pagination.page !== page) {
                throw new Error("Fanvue media pagination is invalid");
            }
        }
        throw new Error("Fanvue media pagination exceeded the safety limit");
    }
    async sendMessage(account: PlatformAccountContext, fanExternalRef: string, payload: OutgoingMessage): Promise<SendResult> {
        const body = payload.body.trim();
        if (!body || body.length > 5000) {
            return {
                ok: false,
                errorCode: "FANVUE_MESSAGE_INVALID",
                failureKind: "PERMANENT",
            };
        }
        const isPpv = payload.ppv !== undefined;
        const requiredCapability = isPpv ? "send_ppv" : "send_text";
        if (!isFanvueLiveSalesEnabled() ||
            !account.capabilities.includes(requiredCapability)) {
            return {
                ok: false,
                error: "Fanvue write capability is not enabled",
                errorCode: "FANVUE_WRITE_DISABLED",
                failureKind: "PERMANENT",
            };
        }
        if (!z.string().uuid().safeParse(fanExternalRef).success) {
            return {
                ok: false,
                errorCode: "FANVUE_FAN_REF_INVALID",
                failureKind: "PERMANENT",
            };
        }
        if (payload.ppv &&
            (!z.string().uuid().safeParse(payload.ppv.vaultItemExternalRef).success ||
                payload.ppv.priceCents < 300 ||
                payload.ppv.priceCents > 50000)) {
            return {
                ok: false,
                errorCode: "FANVUE_PPV_INVALID",
                failureKind: "PERMANENT",
            };
        }
        try {
            const response = sendResponseSchema.parse(responseData(await fanvueRequest(account, `/chats/${encodeURIComponent(fanExternalRef)}/message`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    text: body,
                    ...(payload.ppv
                        ? {
                            mediaUuids: [payload.ppv.vaultItemExternalRef],
                            price: payload.ppv.priceCents,
                        }
                        : {}),
                }),
            })));
            return { ok: true, externalRef: response.messageUuid };
        }
        catch (error) {
            if (!(error instanceof FanvueApiError))
                throw error;
            if (error.status === 429) {
                return {
                    ok: false,
                    errorCode: "FANVUE_SEND_RATE_LIMITED",
                    failureKind: "RETRYABLE",
                    httpStatus: error.status,
                    retryAfterSeconds: error.retryAfterSeconds ?? undefined,
                };
            }
            if ([400, 401, 403, 404, 410].includes(error.status)) {
                return {
                    ok: false,
                    errorCode: error.status === 401
                        ? "FANVUE_SEND_AUTH_REJECTED"
                        : error.status === 403
                            ? "FANVUE_SEND_SCOPE_REJECTED"
                            : "FANVUE_SEND_REJECTED",
                    failureKind: "PERMANENT",
                    httpStatus: error.status,
                };
            }
            return {
                ok: false,
                errorCode: "FANVUE_SEND_RESULT_UNKNOWN",
                failureKind: "AMBIGUOUS",
                httpStatus: error.status,
            };
        }
    }
}
export const fanvueAdapter = new FanvueAdapter();
