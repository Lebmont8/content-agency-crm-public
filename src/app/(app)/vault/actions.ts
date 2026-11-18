"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { assertCan } from "@/auth/permissions";
import { assertAccountAccess } from "@/domain/access";
import { logAudit } from "@/domain/audit";
import type { ActionState } from "@/app/(auth)/actions";
const createSchema = z.object({
    accountId: z.string().min(1),
    title: z.string().trim().min(2).max(120),
    mediaType: z.enum(["PHOTO", "VIDEO", "AUDIO", "BUNDLE"]),
    priceCents: z.coerce.number().int().min(100).max(1000000),
    tags: z
        .string()
        .optional()
        .transform((s) => (s ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10)),
});
export async function createVaultItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user } = await requireAuth();
    assertCan(user.role, "vault.manage");
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Invalid item" };
    }
    const { accountId, title, mediaType, priceCents, tags } = parsed.data;
    const tdb = getTenantDb(user.agencyId);
    await assertAccountAccess(tdb, user, accountId);
    const account = await tdb.creatorAccount.findUnique({
        where: { id: accountId },
        select: { platform: true },
    });
    if (!account)
        return { error: "Account not found" };
    const item = await tdb.vaultItem.create({
        data: {
            agencyId: user.agencyId,
            creatorAccountId: accountId,
            title,
            mediaType,
            defaultPriceCents: priceCents,
            active: account.platform === "mock",
            platformStatus: account.platform === "mock" ? "READY" : "UNKNOWN",
            minPriceCents: 100,
            maxPriceCents: priceCents,
            approvedPriceCents: priceCents,
            lastVerifiedAt: account.platform === "mock" ? new Date() : null,
            tags,
        },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "vault.item.create",
        entityType: "VaultItem",
        entityId: item.id,
        after: { title, mediaType, priceCents, tags },
    });
    revalidatePath("/vault");
    return null;
}
