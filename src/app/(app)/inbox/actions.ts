"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { assertCan, can } from "@/auth/permissions";
import { assertAccountAccess } from "@/domain/access";
import { logAudit } from "@/domain/audit";
import { enqueuePpvDelivery, enqueueTextDelivery } from "@/outbox/enqueue";
import { processDelivery } from "@/outbox/processor";
import { fanOwnsVaultItem } from "@/domain/vault";
import { evaluateSendGuard } from "@/domain/send-guard";
import { requestHumanHandoff, resumeConversation, takeOverConversation } from "@/handoff/workflow";
import { isMockPurchaseEnabled, simulateMockPurchase as reconcileMockPurchase } from "@/platform/mock/purchase";
import type { ActionState } from "@/app/(auth)/actions";
import { effectiveVaultPricing, priceAllowed } from "@/sales/pricing";
import { emitNotification } from "@/notifications/service";
const sendTextSchema = z.object({
    conversationId: z.string().min(1),
    body: z.string().trim().min(1).max(4000),
    aiMode: z.literal("NONE").optional(),
    clientRequestId: z.string().uuid(),
});
export async function sendMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user, agency } = await requireAuth();
    assertCan(user.role, "inbox.work");
    if (agency.suspended)
        return { error: "Agency access is suspended" };
    const parsed = sendTextSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: "Message cannot be empty" };
    const { conversationId, body, aiMode, clientRequestId } = parsed.data;
    const tdb = getTenantDb(user.agencyId);
    const convo = await tdb.conversation.findUnique({
        where: { id: conversationId },
        include: { creatorAccount: { include: { connection: true } }, fan: true },
    });
    if (!convo)
        return { error: "Conversation not found" };
    await assertAccountAccess(tdb, user, convo.creatorAccountId);
    const guard = evaluateSendGuard({
        agencyStatus: agency.suspended ? "SUSPENDED" : "ACTIVE",
        account: convo.creatorAccount,
    }, "TEXT");
    if (!guard.allowed)
        return { error: guard.message };
    const connection = convo.creatorAccount.connection;
    if (!connection)
        return { error: "Platform connection is unavailable" };
    const queued = await enqueueTextDelivery(tdb, {
        agencyId: user.agencyId,
        creatorAccountId: convo.creatorAccountId,
        connectionId: connection.id,
        conversationId,
        fanId: convo.fanId,
        clientRequestId,
        body,
        sentByUserId: user.id,
        aiMode: aiMode ?? "NONE",
    });
    if (!queued.duplicate) {
        await logAudit(tdb, user.agencyId, {
            actorId: user.id,
            action: "message.enqueue",
            entityType: "OutboundDelivery",
            entityId: queued.deliveryId,
            after: { kind: "TEXT", characterCount: body.length },
        });
    }
    await processDelivery(tdb, user.agencyId, queued.deliveryId);
    revalidatePath(`/inbox/${conversationId}`);
    revalidatePath("/inbox");
    return null;
}
const sendPpvSchema = z.object({
    conversationId: z.string().min(1),
    vaultItemId: z.string().min(1),
    priceCents: z.coerce.number().int().min(100).max(1000000),
    caption: z.string().trim().max(1000).optional().or(z.literal("")),
    aiMode: z.literal("NONE").optional(),
    clientRequestId: z.string().uuid(),
});
export async function sendPpv(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user, agency } = await requireAuth();
    assertCan(user.role, "vault.send");
    if (agency.suspended)
        return { error: "Agency access is suspended" };
    const parsed = sendPpvSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Invalid PPV offer" };
    }
    const { conversationId, vaultItemId, priceCents, caption, aiMode, clientRequestId } = parsed.data;
    const tdb = getTenantDb(user.agencyId);
    const convo = await tdb.conversation.findUnique({
        where: { id: conversationId },
        include: { creatorAccount: { include: { connection: true } }, fan: true },
    });
    if (!convo)
        return { error: "Conversation not found" };
    await assertAccountAccess(tdb, user, convo.creatorAccountId);
    const guard = evaluateSendGuard({
        agencyStatus: agency.suspended ? "SUSPENDED" : "ACTIVE",
        account: convo.creatorAccount,
    }, "PPV");
    if (!guard.allowed)
        return { error: guard.message };
    const connection = convo.creatorAccount.connection;
    if (!connection)
        return { error: "Platform connection is unavailable" };
    const item = await tdb.vaultItem.findUnique({
        where: { id: vaultItemId },
        include: { priceGroup: true },
    });
    if (!item || item.creatorAccountId !== convo.creatorAccountId) {
        return { error: "Vault item not found for this account" };
    }
    if (await fanOwnsVaultItem(tdb, convo.fanId, item.id)) {
        return { error: "Fan already purchased this content" };
    }
    if (!item.active || item.platformStatus !== "READY" || !item.lastVerifiedAt) {
        return { error: "This content is not approved for sale" };
    }
    const pricing = effectiveVaultPricing(item);
    if (!priceAllowed({
        requestedPriceCents: priceCents,
        aiMode: aiMode ?? "NONE",
        pricing,
        globalPriceCapCents: pricing.basePriceCents,
    })) {
        return { error: "Price is outside the owner's approved rules" };
    }
    const body = caption?.trim() || item.title;
    const queued = await enqueuePpvDelivery(tdb, {
        agencyId: user.agencyId,
        creatorAccountId: convo.creatorAccountId,
        connectionId: connection.id,
        conversationId,
        fanId: convo.fanId,
        clientRequestId,
        body,
        sentByUserId: user.id,
        aiMode: aiMode ?? "NONE",
        vaultItemId: item.id,
        priceCents,
    });
    if (!queued.duplicate) {
        await logAudit(tdb, user.agencyId, {
            actorId: user.id,
            action: "ppv.enqueue",
            entityType: "OutboundDelivery",
            entityId: queued.deliveryId,
            after: { kind: "PPV", vaultItemId: item.id, priceCents },
        });
    }
    await processDelivery(tdb, user.agencyId, queued.deliveryId);
    revalidatePath(`/inbox/${conversationId}`);
    revalidatePath("/inbox");
    return null;
}
export async function markConversationRead(conversationId: string): Promise<void> {
    const { user } = await requireAuth();
    const tdb = getTenantDb(user.agencyId);
    await tdb.conversation.updateMany({
        where: { id: conversationId },
        data: { unreadCount: 0 },
    });
}
const createContentRequestSchema = z.object({
    conversationId: z.string().min(1),
    summary: z.string().trim().min(3).max(500),
});
export async function createContentRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user } = await requireAuth();
    assertCan(user.role, "inbox.work");
    const parsed = createContentRequestSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: "Describe the custom content request" };
    const tdb = getTenantDb(user.agencyId);
    const conversation = await tdb.conversation.findUnique({
        where: { id: parsed.data.conversationId },
        select: { id: true, creatorAccountId: true },
    });
    if (!conversation)
        return { error: "Conversation not found" };
    await assertAccountAccess(tdb, user, conversation.creatorAccountId);
    const request = await tdb.contentRequest.create({
        data: {
            agencyId: user.agencyId,
            creatorAccountId: conversation.creatorAccountId,
            conversationId: conversation.id,
            summary: parsed.data.summary,
        },
    });
    await emitNotification(tdb, {
        agencyId: user.agencyId,
        creatorAccountId: conversation.creatorAccountId,
        conversationId: conversation.id,
        type: "CUSTOM_CONTENT_REQUEST",
        dedupeKey: `custom-content:${request.id}`,
        title: "Запрос персонального контента",
        body: request.summary.slice(0, 160),
        actionPath: `/inbox/${conversation.id}`,
        severity: "WARNING",
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "content-request.create",
        entityType: "ContentRequest",
        entityId: request.id,
        after: { creatorAccountId: request.creatorAccountId, summaryLength: request.summary.length },
    });
    revalidatePath(`/inbox/${conversation.id}`);
    return null;
}
export async function updateContentRequest(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "inbox.work");
    const data = z.object({
        requestId: z.string().min(1),
        intent: z.enum(["claim", "assign", "complete", "reopen"]),
        assignedUserId: z.string().optional().or(z.literal("")),
    }).parse(Object.fromEntries(formData));
    const tdb = getTenantDb(user.agencyId);
    const request = await tdb.contentRequest.findUnique({ where: { id: data.requestId } });
    if (!request)
        return;
    await assertAccountAccess(tdb, user, request.creatorAccountId);
    let assignedUserId = request.assignedUserId;
    let status = request.status;
    if (data.intent === "claim") {
        assignedUserId = user.id;
        status = "IN_PROGRESS";
    }
    else if (data.intent === "complete") {
        if (request.assignedUserId !== user.id && !can(user.role, "assignments.manage"))
            return;
        status = "COMPLETED";
    }
    else if (data.intent === "reopen") {
        if (!can(user.role, "assignments.manage"))
            return;
        status = "IN_PROGRESS";
    }
    else {
        if (!can(user.role, "assignments.manage"))
            return;
        const targetId = data.assignedUserId?.trim();
        if (!targetId)
            return;
        const target = await tdb.user.findUnique({ where: { id: targetId } });
        if (!target?.isActive)
            return;
        if (target.role !== "OWNER") {
            const assignment = await tdb.chatterAssignment.findFirst({
                where: { userId: target.id, creatorAccountId: request.creatorAccountId },
            });
            if (!assignment)
                return;
        }
        assignedUserId = target.id;
        status = "IN_PROGRESS";
    }
    const completedAt = status === "COMPLETED" ? new Date() : null;
    await tdb.contentRequest.update({
        where: { id: request.id },
        data: { assignedUserId, status, completedAt },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "content-request.update",
        entityType: "ContentRequest",
        entityId: request.id,
        before: { status: request.status, assignedUserId: request.assignedUserId },
        after: { status, assignedUserId },
    });
    revalidatePath(`/inbox/${request.conversationId}`);
    revalidatePath("/notifications");
}
const handoffSchema = z.object({
    conversationId: z.string().min(1),
    intent: z.enum(["request", "takeover", "resume"]),
    reason: z.string().trim().min(3).max(500),
    mode: z.enum(["ASSIST", "AUTO"]).optional(),
});
export async function updateHandoff(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user, agency } = await requireAuth();
    assertCan(user.role, "inbox.work");
    if (agency.suspended)
        return { error: "Agency access is suspended" };
    const parsed = handoffSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
        return { error: "A reason of at least 3 characters is required" };
    }
    const { conversationId, intent, reason, mode } = parsed.data;
    if (intent === "resume" && !mode) {
        return { error: "Choose an explicit AI resume mode" };
    }
    const tdb = getTenantDb(user.agencyId);
    const conversation = await tdb.conversation.findUnique({
        where: { id: conversationId },
        include: { creatorAccount: { select: { id: true, aiAutoReply: true } } },
    });
    if (!conversation)
        return { error: "Conversation not found" };
    try {
        await assertAccountAccess(tdb, user, conversation.creatorAccountId);
    }
    catch {
        return { error: "No access to this account" };
    }
    let result;
    if (intent === "request") {
        result = await requestHumanHandoff(tdb, {
            agencyId: user.agencyId,
            conversationId,
            reason,
            requestedByUserId: user.id,
        });
    }
    else if (intent === "takeover") {
        result = await takeOverConversation(tdb, {
            agencyId: user.agencyId,
            conversationId,
            actorUserId: user.id,
            reason,
        });
    }
    else {
        if (conversation.assignedUserId !== user.id &&
            !can(user.role, "assignments.manage")) {
            return { error: "Only the owner of this handoff or a manager can resume AI" };
        }
        if (mode === "AUTO" && !conversation.creatorAccount.aiAutoReply) {
            return { error: "Auto reply is disabled for this creator account" };
        }
        result = await resumeConversation(tdb, {
            agencyId: user.agencyId,
            conversationId,
            actorUserId: user.id,
            mode: mode!,
            reason,
        });
    }
    if (!result.ok) {
        return {
            error: result.code === "NOT_FOUND"
                ? "Conversation not found"
                : "The handoff changed in another session. Refresh and try again.",
        };
    }
    revalidatePath(`/inbox/${conversationId}`);
    revalidatePath("/inbox");
    return null;
}
const mockPurchaseSchema = z.object({
    vaultSendId: z.string().min(1),
});
export async function simulateMockPurchase(_prev: ActionState, formData: FormData): Promise<ActionState> {
    if (!isMockPurchaseEnabled())
        return { error: "Mock purchase is unavailable" };
    const { user, agency } = await requireAuth();
    assertCan(user.role, "vault.send");
    if (agency.suspended)
        return { error: "Agency access is suspended" };
    const parsed = mockPurchaseSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: "Invalid mock purchase" };
    const tdb = getTenantDb(user.agencyId);
    const send = await tdb.vaultSend.findUnique({
        where: { id: parsed.data.vaultSendId },
        select: {
            vaultItem: { select: { creatorAccountId: true } },
        },
    });
    if (!send)
        return { error: "PPV offer not found" };
    try {
        await assertAccountAccess(tdb, user, send.vaultItem.creatorAccountId);
    }
    catch {
        return { error: "No access to this account" };
    }
    const result = await reconcileMockPurchase(tdb, {
        agencyId: user.agencyId,
        vaultSendId: parsed.data.vaultSendId,
        actorUserId: user.id,
    });
    if (!result.ok) {
        const errors = {
            NOT_FOUND: "PPV offer not found",
            NOT_MOCK: "Purchase simulation is only available for mock accounts",
            NOT_AI_PPV: "Only an AI-originated PPV can be simulated",
            DELIVERY_NOT_SENT: "The PPV must be delivered before it can be purchased",
        } as const;
        return { error: errors[result.code] };
    }
    revalidatePath(`/inbox/${result.conversationId}`);
    revalidatePath("/inbox");
    revalidatePath("/analytics");
    revalidatePath("/kpi");
    return null;
}
