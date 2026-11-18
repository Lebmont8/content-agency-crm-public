import "server-only";
import type { CopilotProviderTrace, CopilotVaultItem, PpvSuggestion, ReplyDraft, ReplyRequest, TraceableCopilot } from "@/copilot";
import type { SalesContext } from "@/sales/context";
export const OPENAI_SHADOW_MODEL: "gpt-5.6-terra" = undefined as unknown as "gpt-5.6-terra";
export const OPENAI_LIVE_MODEL: "gpt-5.6-terra" = undefined as unknown as "gpt-5.6-terra";
export const OPENAI_PREVIEW_MODEL: "gpt-5.6-terra" = undefined as unknown as "gpt-5.6-terra";
type RuntimeEnv = Readonly<Record<string, string | undefined>>;
export type OpenAiShadowConfig = {
    apiKey: string;
    estimatedCostMicros: number;
    timeoutMs: number;
};
export type OpenAiPreviewConfig = OpenAiShadowConfig & {
    dailyRunLimit: number;
    dailyCostLimitMicros: number;
};
export type OpenAiShadowReadiness = {
    ready: true;
    config: OpenAiShadowConfig;
} | {
    ready: false;
    code: "OPENAI_SHADOW_DISABLED" | "OPENAI_API_KEY_MISSING" | "OPENAI_API_KEY_INVALID" | "OPENAI_COST_ESTIMATE_INVALID" | "OPENAI_TIMEOUT_INVALID";
};
export type OpenAiLiveReadiness = {
    ready: true;
    config: OpenAiShadowConfig;
} | {
    ready: false;
    code: "OPENAI_LIVE_DISABLED" | "OPENAI_API_KEY_MISSING" | "OPENAI_API_KEY_INVALID" | "OPENAI_LIVE_COST_ESTIMATE_INVALID" | "OPENAI_LIVE_TIMEOUT_INVALID";
};
export type OpenAiPreviewReadiness = {
    ready: true;
    config: OpenAiPreviewConfig;
} | {
    ready: false;
    code: "OPENAI_PREVIEW_DISABLED" | "OPENAI_API_KEY_MISSING" | "OPENAI_API_KEY_INVALID" | "OPENAI_PREVIEW_COST_ESTIMATE_INVALID" | "OPENAI_PREVIEW_TIMEOUT_INVALID" | "OPENAI_PREVIEW_RUN_LIMIT_INVALID" | "OPENAI_PREVIEW_DAILY_COST_LIMIT_INVALID";
};
export function openAiShadowReadiness(_env?: RuntimeEnv): OpenAiShadowReadiness {
    return { ready: false, code: "OPENAI_SHADOW_DISABLED" };
}
export function openAiLiveReadiness(_env?: RuntimeEnv): OpenAiLiveReadiness {
    return { ready: false, code: "OPENAI_LIVE_DISABLED" };
}
export function openAiPreviewReadiness(_env?: RuntimeEnv): OpenAiPreviewReadiness {
    return { ready: false, code: "OPENAI_PREVIEW_DISABLED" };
}
export class OpenAiCopilotError extends Error {
    declare readonly code: "OPENAI_REQUEST_TIMEOUT" | "OPENAI_REQUEST_FAILED" | "OPENAI_RATE_LIMITED" | "OPENAI_PROVIDER_UNAVAILABLE" | "OPENAI_RESPONSE_INVALID" | "OPENAI_RESPONSE_REFUSED";
    constructor(_code: "OPENAI_REQUEST_TIMEOUT" | "OPENAI_REQUEST_FAILED" | "OPENAI_RATE_LIMITED" | "OPENAI_PROVIDER_UNAVAILABLE" | "OPENAI_RESPONSE_INVALID" | "OPENAI_RESPONSE_REFUSED") {
        super("AUTOMATION_NOT_DISTRIBUTED");
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
}
type FetchLike = typeof fetch;
export function openAiShadowInput(_context: SalesContext): ({
    role: "developer";
    content: string;
} | {
    role: "user";
    content: string;
})[] {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function openAiLiveInput(_context: SalesContext): ({
    role: "developer";
    content: string;
} | {
    role: "user";
    content: string;
})[] {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function openAiPreviewInput(_req: ReplyRequest): ({
    role: "developer";
    content: string;
} | {
    role: "user";
    content: string;
})[] {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export class OpenAiShadowCopilot implements TraceableCopilot {
    declare private readonly config: unknown;
    declare private readonly fetchImpl: unknown;
    declare private readonly mode: unknown;
    declare readonly provider: "openai";
    declare readonly model: "gpt-5.6-terra";
    declare readonly estimatedCostMicros: number;
    constructor(_config: OpenAiShadowConfig, _fetchImpl?: FetchLike, _mode?: "SHADOW" | "LIVE") {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
    decide(_context: SalesContext): Promise<unknown> {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
    decideWithTrace(_context: SalesContext): Promise<{
        decision: unknown;
        trace: CopilotProviderTrace;
    }> {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
    suggestReply(_req: ReplyRequest): Promise<ReplyDraft> {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
    suggestPpv(_req: ReplyRequest, _vault: CopilotVaultItem[]): Promise<PpvSuggestion | null> {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
}
export class OpenAiLiveCopilot extends OpenAiShadowCopilot {
    declare readonly model: "gpt-5.6-terra";
    constructor(config: OpenAiShadowConfig, fetchImpl?: FetchLike) {
        super(config, fetchImpl);
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
}
export class OpenAiPreviewCopilot {
    declare private readonly config: unknown;
    declare private readonly fetchImpl: unknown;
    declare readonly provider: "openai";
    declare readonly model: "gpt-5.6-terra";
    declare readonly estimatedCostMicros: number;
    constructor(_config: OpenAiPreviewConfig, _fetchImpl?: FetchLike) {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
    suggestReply(_req: ReplyRequest): Promise<ReplyDraft> {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
    suggestReplyWithTrace(_req: ReplyRequest): Promise<{
        reply: ReplyDraft;
        trace: CopilotProviderTrace;
    }> {
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
}
export function createOpenAiShadowCopilot(_env?: RuntimeEnv, _fetchImpl?: FetchLike): OpenAiShadowCopilot {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function createOpenAiLiveCopilot(_env?: RuntimeEnv, _fetchImpl?: FetchLike): OpenAiLiveCopilot {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function createOpenAiPreviewCopilot(_env?: RuntimeEnv, _fetchImpl?: FetchLike): OpenAiPreviewCopilot {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export {};
