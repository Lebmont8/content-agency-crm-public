import { z } from "zod";
import type { TenantDb } from "@/lib/tenant-db";
import { createOpenAiShadowCopilot, openAiShadowReadiness } from "@/copilot/openai";
import { InboundProcessingError } from "@/inbound/errors";
import type { InboundEventForHandler } from "@/inbound/types";
import { runSalesOrchestrator } from "@/sales/orchestrator";
const payloadSchema = z
    .object({ messageExternalRef: z.string().min(1).max(240) })
    .strict();
type SalesOrchestrator = typeof runSalesOrchestrator;
export async function handleFanvueShadowMessage(tdb: TenantDb, event: InboundEventForHandler, options: {
    orchestrator?: SalesOrchestrator;
    env?: Readonly<Record<string, string | undefined>>;
} = {}): Promise<void> {
    const payload = payloadSchema.safeParse(event.payload);
    if (!payload.success) {
        throw new InboundProcessingError("FANVUE_SHADOW_PAYLOAD_INVALID", false);
    }
    const connection = await tdb.platformConnection.findUnique({
        where: { id: event.connectionId },
        include: { creatorAccount: true },
    });
    if (!connection ||
        connection.agencyId !== event.agencyId ||
        connection.platform !== "fanvue") {
        throw new InboundProcessingError("FANVUE_SHADOW_CONNECTION_INVALID", false);
    }
    if (connection.creatorAccount.pilotMode !== "SHADOW") {
        throw new InboundProcessingError("REAL_LLM_SHADOW_MODE_REQUIRED", false);
    }
    const readiness = openAiShadowReadiness(options.env);
    if (!readiness.ready) {
        throw new InboundProcessingError(readiness.code, true);
    }
    const message = await tdb.message.findFirst({
        where: {
            externalRef: payload.data.messageExternalRef,
            direction: "IN",
            conversation: { creatorAccountId: connection.creatorAccountId },
        },
        select: { id: true, conversationId: true },
    });
    if (!message) {
        throw new InboundProcessingError("FANVUE_SHADOW_MESSAGE_NOT_FOUND", false);
    }
    await (options.orchestrator ?? runSalesOrchestrator)(tdb, {
        agencyId: event.agencyId,
        inboundEventId: event.id,
        conversationId: message.conversationId,
        triggerMessageId: message.id,
    }, {
        executionMode: "SHADOW",
        copilot: createOpenAiShadowCopilot(options.env),
    });
}
