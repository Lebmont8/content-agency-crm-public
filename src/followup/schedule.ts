type SalesProfileSchedule = {
    timezone: string;
    businessHours: unknown;
    maxFollowUps: number;
};
export function isWithinBusinessHours(_date: Date, _timezone: string, _businessHours: unknown): boolean {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function nextBusinessTime(_candidate: Date, _timezone: string, _businessHours: unknown): Date | null {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export function buildNextFollowUp(_input: {
    agencyId: string;
    creatorAccountId: string;
    conversationId: string;
    sourceAgentRunId: string;
    sourceAgentActionId: string;
    previousSequence: number;
    sentAt: Date;
    profile: SalesProfileSchedule | null;
}): {
    agencyId: string;
    creatorAccountId: string;
    conversationId: string;
    sourceAgentRunId: string;
    sourceAgentActionId: string;
    sequence: number;
    runAt: Date;
    nextAttemptAt: Date;
    dedupeKey: string;
    reason: string;
    body: string;
} | null {
    throw new Error("AUTOMATION_NOT_DISTRIBUTED");
}
export {};
