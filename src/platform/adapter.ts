export interface Page<T> {
    items: T[];
    nextCursor?: string;
}
export type SubscriptionStatusDTO = "active" | "expired";
export interface FanDTO {
    externalFanRef: string;
    username: string;
    displayName: string;
    subscribedAt: Date;
    lastActiveAt: Date;
    subscriptionStatus: SubscriptionStatusDTO;
}
export interface MessageDTO {
    externalRef: string;
    direction: "in" | "out";
    body: string;
    sentAt: Date;
    ppv?: {
        vaultItemExternalRef: string;
        priceCents: number;
        purchased: boolean;
        purchasedAt?: Date;
    };
}
export type TransactionTypeDTO = "subscription" | "ppv" | "tip";
export interface TransactionDTO {
    externalRef: string;
    fanExternalRef: string;
    fanUsername?: string;
    fanDisplayName?: string;
    type: TransactionTypeDTO;
    amountCents: number;
    occurredAt: Date;
    currency?: string;
    providerMessageRef?: string;
    vaultItemExternalRef?: string;
}
export type MediaTypeDTO = "photo" | "video" | "audio" | "bundle";
export interface VaultItemDTO {
    externalRef: string;
    title: string;
    mediaType: MediaTypeDTO;
    defaultPriceCents: number;
    tags: string[];
}
export interface OutgoingMessage {
    body: string;
    ppv?: {
        vaultItemExternalRef: string;
        priceCents: number;
    };
}
export interface SendResult {
    ok: boolean;
    externalRef?: string;
    sentAt?: Date;
    error?: string;
    errorCode?: string;
    failureKind?: "RETRYABLE" | "PERMANENT" | "AMBIGUOUS";
    httpStatus?: number;
    retryAfterSeconds?: number;
}
export interface PlatformAccountContext {
    agencyId: string;
    creatorAccountId: string;
    platform: string;
    externalAccountRef: string;
    connectionId: string;
    remoteAccountId: string | null;
    secretRef: string | null;
    grantedScopes: readonly string[];
    capabilities: readonly string[];
}
export function toPlatformAccountContext(account: {
    id: string;
    agencyId: string;
    platform: string;
    externalAccountRef: string;
    connection: {
        id: string;
        remoteAccountId: string | null;
        secretRef: string | null;
        grantedScopes: string[];
        capabilities: string[];
    } | null;
}): PlatformAccountContext {
    if (!account.connection) {
        throw new Error(`Platform connection is missing for account "${account.id}"`);
    }
    return {
        agencyId: account.agencyId,
        creatorAccountId: account.id,
        platform: account.platform,
        externalAccountRef: account.externalAccountRef,
        connectionId: account.connection.id,
        remoteAccountId: account.connection.remoteAccountId,
        secretRef: account.connection.secretRef,
        grantedScopes: account.connection.grantedScopes,
        capabilities: account.connection.capabilities,
    };
}
export interface PlatformAdapter {
    platform: "onlyfans" | "fansly" | (string & {});
    getFans(account: PlatformAccountContext, cursor?: string): Promise<Page<FanDTO>>;
    getConversation(account: PlatformAccountContext, fanExternalRef: string, cursor?: string): Promise<Page<MessageDTO>>;
    getTransactions(account: PlatformAccountContext, since?: Date): Promise<TransactionDTO[]>;
    sendMessage(account: PlatformAccountContext, fanExternalRef: string, payload: OutgoingMessage): Promise<SendResult>;
    getVaultItems(account: PlatformAccountContext): Promise<VaultItemDTO[]>;
}
