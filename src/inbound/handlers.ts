import type { TenantDb } from "@/lib/tenant-db";
import { InboundProcessingError } from "@/inbound/errors";
import { handleMockMessageReceived } from "@/inbound/mock-handler";
import { handleFanvueShadowMessage } from "@/inbound/fanvue-shadow-handler";
import { handleFanslyMessageReceived } from "@/inbound/fansly-handler";
import { handleFanvuePaymentSucceeded } from "@/inbound/fanvue-payment-handler";
import type { InboundEventForHandler } from "@/inbound/types";
export async function handleInboundEvent(tdb: TenantDb, event: InboundEventForHandler): Promise<void> {
    if (event.type === "mock.message.received") {
        await handleMockMessageReceived(tdb, event);
        return;
    }
    if (event.type === "fanvue.message.shadow") {
        await handleFanvueShadowMessage(tdb, event);
        return;
    }
    if (event.type === "creator.payment.succeeded") {
        await handleFanvuePaymentSucceeded(tdb, event);
        return;
    }
    if (event.type === "fansly.message.received") {
        await handleFanslyMessageReceived(tdb, event);
        return;
    }
    throw new InboundProcessingError("INBOUND_EVENT_TYPE_UNSUPPORTED", false);
}
