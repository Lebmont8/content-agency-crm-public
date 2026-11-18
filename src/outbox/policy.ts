export type DeliveryFailureKind = "RETRYABLE" | "PERMANENT" | "AMBIGUOUS";
export type FailureDecision = {
    status: "RETRY" | "FAILED" | "DLQ" | "CONFIRMING";
    nextAttemptAt: Date;
};
const RETRY_DELAYS_MS = [5000, 30000, 2 * 60000, 10 * 60000, 30 * 60000];
export function retryDelayMs(attemptNumber: number, retryAfterSeconds?: number): number {
    if (retryAfterSeconds != null && retryAfterSeconds >= 0) {
        return Math.min(retryAfterSeconds * 1000, 60 * 60000);
    }
    return RETRY_DELAYS_MS[Math.min(Math.max(attemptNumber - 1, 0), RETRY_DELAYS_MS.length - 1)]!;
}
export function decideFailure(input: {
    kind: DeliveryFailureKind;
    attemptNumber: number;
    maxAttempts: number;
    now: Date;
    retryAfterSeconds?: number;
}): FailureDecision {
    if (input.kind === "AMBIGUOUS") {
        return { status: "CONFIRMING", nextAttemptAt: input.now };
    }
    if (input.kind === "PERMANENT") {
        return { status: "FAILED", nextAttemptAt: input.now };
    }
    if (input.attemptNumber >= input.maxAttempts) {
        return { status: "DLQ", nextAttemptAt: input.now };
    }
    return {
        status: "RETRY",
        nextAttemptAt: new Date(input.now.getTime() + retryDelayMs(input.attemptNumber, input.retryAfterSeconds)),
    };
}
export function safeErrorCode(value: string | undefined, fallback: string): string {
    if (!value)
        return fallback;
    return /^[A-Z][A-Z0-9_:-]{0,79}$/.test(value) ? value : fallback;
}
