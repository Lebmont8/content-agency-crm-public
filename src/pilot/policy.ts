export type PilotOperation = "LIVE_PLATFORM_READ" | "REAL_LLM" | "LIVE_PLATFORM_WRITE_ASSIST" | "LIVE_PLATFORM_WRITE_AUTO";
export type PilotGateCode = "PILOT_RUNTIME_DISABLED" | "AGENCY_SUSPENDED" | "AGENCY_PILOT_DISABLED" | "ACCOUNT_INACTIVE" | "ACCOUNT_NOT_ACTIVATED" | "PILOT_MODE_OFF" | "COMPLIANCE_NOT_APPROVED" | "AI_RUN_LIMIT_MISSING" | "AI_COST_LIMIT_MISSING" | "PILOT_MODE_REQUIRES_ASSIST" | "PILOT_MODE_REQUIRES_AUTO" | "AUTO_REPLY_DISABLED";
export type PilotGateDecision = {
    allowed: true;
} | {
    allowed: false;
    code: PilotGateCode;
};
export type PilotGateInput = {
    runtimeEnabled: boolean;
    agency: {
        status: string;
        pilotEnabled: boolean;
    };
    account: {
        platform: string;
        status: string;
        activated: boolean;
        pilotMode: string;
        complianceApprovedAt: Date | null;
        dailyAiRunLimit: number;
        dailyAiCostLimitMicros: number;
        aiAutoReply: boolean;
    };
};
export class PilotGateDeniedError extends Error {
    declare readonly code: PilotGateCode;
    constructor(_code: PilotGateCode) {
        super("AUTOMATION_NOT_DISTRIBUTED");
        throw new Error("AUTOMATION_NOT_DISTRIBUTED");
    }
}
export function evaluatePilotGate(_input: PilotGateInput, _operation: PilotOperation): PilotGateDecision {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function assertPilotGate(_input: PilotGateInput, _operation: PilotOperation): void {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
