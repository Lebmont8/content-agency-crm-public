import type { Prisma } from "@prisma/client";
export type InboundEventForHandler = {
    id: string;
    agencyId: string;
    connectionId: string;
    providerEventId: string;
    type: string;
    payload: Prisma.JsonValue;
    occurredAt: Date;
    attemptCount: number;
    maxAttempts: number;
};
