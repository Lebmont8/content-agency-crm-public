import type { Copilot, CopilotVaultItem, PpvSuggestion, ReplyDraft, ReplyRequest } from "./index";
import type { CopilotDecision } from "./contracts";
import type { SalesContext } from "@/sales/context";
export class MockCopilot implements Copilot {
    decide(_context: SalesContext): Promise<CopilotDecision> {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
    suggestReply(_req: ReplyRequest): Promise<ReplyDraft> {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
    suggestPpv(_req: ReplyRequest, _vault: CopilotVaultItem[]): Promise<PpvSuggestion | null> {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
}
