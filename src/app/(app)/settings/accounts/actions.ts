"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { assertCan } from "@/auth/permissions";
import { logAudit } from "@/domain/audit";
import { getPlatformCapabilities, getPlatformDefinition } from "@/platform/registry";
import type { ActionState } from "@/app/(auth)/actions";
import { deletePlatformTokens } from "@/platform/secrets/credential-store";
import { queuedDeliveryCancellationArgs } from "@/domain/send-guard";
import { followUpCancellationArgs } from "@/followup/cancel";
import { assertAccountAccess } from "@/domain/access";
const createSchema = z.object({
    displayName: z.string().min(2).max(80),
    platform: z.enum(["fanvue", "onlyfans", "fansly"]),
    externalAccountRef: z.string().max(120).optional().or(z.literal("")),
});
export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user } = await requireAuth();
    assertCan(user.role, "assignments.manage");
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { displayName, platform } = parsed.data;
    const definition = getPlatformDefinition(platform);
    if (!definition)
        return { error: "Unsupported platform" };
    const ref = parsed.data.externalAccountRef?.trim() ||
        `${platform}:${crypto.randomUUID()}`;
    const tdb = getTenantDb(user.agencyId);
    const account = await tdb.creatorAccount.create({
        data: {
            agencyId: user.agencyId,
            displayName,
            platform,
            externalAccountRef: ref,
            connection: {
                create: {
                    agency: { connect: { id: user.agencyId } },
                    platform,
                    authMethod: definition.authMethod,
                    status: "DRAFT",
                    capabilities: [],
                },
            },
        },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "account.create",
        entityType: "CreatorAccount",
        entityId: account.id,
        after: { displayName, platform },
    });
    revalidatePath("/settings/accounts");
    return null;
}
export async function setAccountStatus(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "assignments.manage");
    const data = z
        .object({
        accountId: z.string().min(1),
        status: z.enum(["ACTIVE", "PAUSED", "DISCONNECTED"]),
    })
        .parse(Object.fromEntries(formData));
    const tdb = getTenantDb(user.agencyId);
    const before = await tdb.creatorAccount.findUnique({
        where: { id: data.accountId },
    });
    if (!before)
        return;
    const now = new Date();
    await tdb.$transaction([
        tdb.creatorAccount.update({
            where: { id: data.accountId },
            data: { status: data.status },
        }),
        ...(data.status === "ACTIVE"
            ? []
            : [
                tdb.outboundDelivery.updateMany(queuedDeliveryCancellationArgs(data.accountId, `ACCOUNT_${data.status}`, now)),
                tdb.followUpJob.updateMany(followUpCancellationArgs({ creatorAccountId: data.accountId }, data.status === "PAUSED" ? "ACCOUNT_PAUSED" : "ACCOUNT_DISCONNECTED", now)),
            ]),
    ]);
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "account.status.update",
        entityType: "CreatorAccount",
        entityId: data.accountId,
        before: { status: before.status },
        after: { status: data.status },
    });
    revalidatePath("/settings/accounts");
}
export async function syncAccount(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "assignments.manage");
    const accountId = z.string().min(1).parse(formData.get("accountId"));
    const tdb = getTenantDb(user.agencyId);
    const account = await tdb.creatorAccount.findUnique({
        where: { id: accountId },
        include: {
            connection: true,
            agency: { select: { status: true, pilotEnabled: true } },
        },
    });
    if (!account)
        return;
    if (!getPlatformCapabilities(account.platform, account.connection?.status, account.connection?.capabilities).canSync)
        return;
    const { platformSyncFailureCode, runAccountSync } = await import("@/platform/sync-runner");
    let result;
    try {
        result = await runAccountSync(tdb, user.agencyId, account);
    }
    catch (error) {
        const code = platformSyncFailureCode(error);
        await logAudit(tdb, user.agencyId, {
            actorId: user.id,
            action: "platform.connection.sync",
            entityType: "PlatformConnection",
            entityId: account.connection?.id,
            after: { platform: account.platform, result: "failed", code },
        });
        console.warn(`[sync] ${account.id}: ${code}`);
        revalidatePath("/settings/accounts");
        return;
    }
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "platform.connection.sync",
        entityType: "PlatformConnection",
        entityId: account.connection?.id,
        after: { platform: account.platform, result: "completed", ...result },
    });
    console.log(`[sync] ${account.displayName}: ${result.fans} fans, ${result.messages} new messages, ` +
        `${result.transactions} new transactions, ${result.vaultItems} vault items`);
    revalidatePath("/settings/accounts");
    revalidatePath("/inbox");
}
export async function disconnectFanvue(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "assignments.manage");
    const accountId = z.string().min(1).parse(formData.get("accountId"));
    const tdb = getTenantDb(user.agencyId);
    const account = await tdb.creatorAccount.findUnique({
        where: { id: accountId },
        include: { connection: true },
    });
    if (!account || account.platform !== "fanvue" || !account.connection)
        return;
    await deletePlatformTokens(tdb, user.agencyId, account.connection.id);
    const now = new Date();
    await tdb.$transaction([
        tdb.platformConnection.update({
            where: { id: account.connection.id },
            data: {
                status: "REVOKED",
                remoteAccountId: null,
                secretRef: null,
                grantedScopes: [],
                capabilities: [],
                expiresAt: null,
                lastVerifiedAt: null,
                lastSyncStartedAt: null,
                lastSyncedAt: null,
                syncLeaseOwner: null,
                syncLeaseUntil: null,
                lastErrorCode: null,
            },
        }),
        tdb.creatorAccount.update({
            where: { id: account.id },
            data: { status: "DISCONNECTED", aiAutoReply: false },
        }),
        tdb.outboundDelivery.updateMany(queuedDeliveryCancellationArgs(account.id, "ACCOUNT_DISCONNECTED", now)),
        tdb.followUpJob.updateMany(followUpCancellationArgs({ creatorAccountId: account.id }, "ACCOUNT_DISCONNECTED", now)),
    ]);
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "platform.connection.disconnect",
        entityType: "PlatformConnection",
        entityId: account.connection.id,
        before: { platform: "fanvue", status: account.connection.status },
        after: { platform: "fanvue", status: "REVOKED" },
    });
    revalidatePath("/settings/accounts");
    revalidatePath("/inbox");
}
export async function toggleAssignment(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "assignments.manage");
    const data = z
        .object({ accountId: z.string().min(1), userId: z.string().min(1) })
        .parse(Object.fromEntries(formData));
    const tdb = getTenantDb(user.agencyId);
    const [account, target] = await Promise.all([
        tdb.creatorAccount.findUnique({ where: { id: data.accountId } }),
        tdb.user.findUnique({ where: { id: data.userId } }),
    ]);
    if (!account || !target)
        return;
    if (target.role === "OWNER")
        return;
    if (user.role === "MANAGER") {
        await assertAccountAccess(tdb, user, data.accountId);
        if (target.role !== "CHATTER")
            return;
    }
    const existing = await tdb.chatterAssignment.findFirst({
        where: { userId: data.userId, creatorAccountId: data.accountId },
    });
    if (existing) {
        await tdb.chatterAssignment.delete({ where: { id: existing.id } });
        await logAudit(tdb, user.agencyId, {
            actorId: user.id,
            action: "assignment.remove",
            entityType: "ChatterAssignment",
            entityId: existing.id,
            before: { userId: data.userId, creatorAccountId: data.accountId },
        });
    }
    else {
        const created = await tdb.chatterAssignment.create({
            data: {
                agencyId: user.agencyId,
                userId: data.userId,
                creatorAccountId: data.accountId,
            },
        });
        await logAudit(tdb, user.agencyId, {
            actorId: user.id,
            action: "assignment.add",
            entityType: "ChatterAssignment",
            entityId: created.id,
            after: { userId: data.userId, creatorAccountId: data.accountId },
        });
    }
    revalidatePath("/settings/accounts");
}
