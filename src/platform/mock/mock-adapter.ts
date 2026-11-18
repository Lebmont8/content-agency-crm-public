import type { FanDTO, MessageDTO, OutgoingMessage, Page, PlatformAccountContext, PlatformAdapter, SendResult, TransactionDTO, VaultItemDTO } from "@/platform/adapter";
import { generateDataset } from "./generator";
const PAGE_SIZE = 25;
function paginate<T>(items: T[], cursor?: string): Page<T> {
    const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
    const slice = items.slice(offset, offset + PAGE_SIZE);
    const next = offset + PAGE_SIZE;
    return {
        items: slice,
        nextCursor: next < items.length ? String(next) : undefined,
    };
}
export class MockAdapter implements PlatformAdapter {
    readonly platform = "mock";
    async getFans(account: PlatformAccountContext, cursor?: string): Promise<Page<FanDTO>> {
        const { fans } = generateDataset(account.externalAccountRef);
        return paginate(fans.map(({ messages: _m, transactions: _t, ...fan }) => fan), cursor);
    }
    async getConversation(account: PlatformAccountContext, fanExternalRef: string, cursor?: string): Promise<Page<MessageDTO>> {
        const { fans } = generateDataset(account.externalAccountRef);
        const fan = fans.find((f) => f.externalFanRef === fanExternalRef);
        return paginate(fan?.messages ?? [], cursor);
    }
    async getTransactions(account: PlatformAccountContext, since?: Date): Promise<TransactionDTO[]> {
        const { fans } = generateDataset(account.externalAccountRef);
        const all = fans.flatMap((f) => f.transactions);
        return since ? all.filter((t) => t.occurredAt >= since) : all;
    }
    async sendMessage(_account: PlatformAccountContext, _fanExternalRef: string, _payload: OutgoingMessage): Promise<SendResult> {
        return {ok:false,errorCode:"MOCK_NOT_DISTRIBUTED",failureKind:"PERMANENT"};
    }
    async getVaultItems(account: PlatformAccountContext): Promise<VaultItemDTO[]> {
        return generateDataset(account.externalAccountRef).vaultItems;
    }
}
export const mockAdapter = new MockAdapter();
