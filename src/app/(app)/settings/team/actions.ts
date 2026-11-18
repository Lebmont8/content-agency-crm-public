"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, revokeUserSessions } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { assertCan, canInviteRole, canRemoveUser } from "@/auth/permissions";
import { logAudit } from "@/domain/audit";
import type { ActionState } from "@/app/(auth)/actions";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/auth-token";
const inviteSchema = z.object({
    email: z.string().email().toLowerCase(),
    role: z.enum(["OWNER", "MANAGER", "CHATTER"]),
});
export async function inviteUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user } = await requireAuth();
    assertCan(user.role, "users.manage");
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: "Enter a valid email and role" };
    const { email, role } = parsed.data;
    if (!canInviteRole(user.role, role)) {
        return { error: `As ${user.role} you cannot invite a ${role}` };
    }
    const tdb = getTenantDb(user.agencyId);
    const pending = await tdb.invitation.findFirst({
        where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending)
        return { error: "A pending invitation for this email already exists" };
    const token = createOpaqueToken(24);
    const invite = await tdb.invitation.create({
        data: {
            agencyId: user.agencyId,
            email,
            role,
            tokenHash: hashOpaqueToken(token),
            invitedById: user.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "user.invite",
        entityType: "Invitation",
        entityId: invite.id,
        after: { email, role },
    });
    revalidatePath("/settings/team");
    return { inviteUrl: `/invite/${token}` };
}
export async function revokeInvite(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "users.manage");
    const id = z.string().min(1).parse(formData.get("inviteId"));
    const tdb = getTenantDb(user.agencyId);
    await tdb.invitation.deleteMany({ where: { id, acceptedAt: null } });
    revalidatePath("/settings/team");
}
export async function deactivateUser(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "users.manage");
    const targetId = z.string().min(1).parse(formData.get("userId"));
    if (targetId === user.id)
        return;
    const tdb = getTenantDb(user.agencyId);
    const target = await tdb.user.findUnique({ where: { id: targetId } });
    if (!target || !canRemoveUser(user.role, target.role))
        return;
    await tdb.user.update({ where: { id: targetId }, data: { isActive: false } });
    await revokeUserSessions(targetId);
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "user.deactivate",
        entityType: "User",
        entityId: targetId,
        before: { email: target.email, role: target.role, isActive: true },
        after: { isActive: false },
    });
    revalidatePath("/settings/team");
}
