export class InboundProcessingError extends Error {
    constructor(readonly code: string, readonly retryable: boolean) {
        super(code);
        this.name = "InboundProcessingError";
    }
}
export function inboundFailure(error: unknown): {
    code: string;
    retryable: boolean;
} {
    if (error instanceof InboundProcessingError) {
        return { code: error.code, retryable: error.retryable };
    }
    return { code: "INBOUND_HANDLER_FAILED", retryable: true };
}
