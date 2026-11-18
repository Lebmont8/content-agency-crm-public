"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { assertCan } from "@/auth/permissions";
import { assertAccountAccess } from "@/domain/access";
import { logAudit } from "@/domain/audit";
import type { ActionState } from "@/app/(auth)/actions";
const noteSchema = z.object({
    fanId: z.string().min(1),
    body: z.string().trim().min(1).max(2000),
});
export async function addNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user } = await requireAuth();
    assertCan(user.role, "fans.edit");
    const parsed = noteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: "Note cannot be empty" };
    const tdb = getTenantDb(user.agencyId);
    const fan = await tdb.fan.findUnique({ where: { id: parsed.data.fanId } });
    if (!fan)
        return { error: "Fan not found" };
    await assertAccountAccess(tdb, user, fan.creatorAccountId);
    const note = await tdb.fanNote.create({
        data: {
            agencyId: user.agencyId,
            fanId: fan.id,
            authorId: user.id,
            body: parsed.data.body,
        },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "fan.note.create",
        entityType: "FanNote",
        entityId: note.id,
        after: { fan: fan.username, body: parsed.data.body.slice(0, 120) },
    });
    revalidatePath(`/fans/${fan.id}`);
    return null;
}
export async function deleteNote(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "fans.edit");
    const noteId = z.string().min(1).parse(formData.get("noteId"));
    const tdb = getTenantDb(user.agencyId);
    const note = await tdb.fanNote.findUnique({
        where: { id: noteId },
        include: { fan: true },
    });
    if (!note)
        return;
    await assertAccountAccess(tdb, user, note.fan.creatorAccountId);
    await tdb.fanNote.delete({ where: { id: noteId } });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "fan.note.delete",
        entityType: "FanNote",
        entityId: noteId,
        before: { fan: note.fan.username, body: note.body.slice(0, 120) },
    });
    revalidatePath(`/fans/${note.fanId}`);
}
const tagSchema = z.object({
    fanId: z.string().min(1),
    name: z
        .string()
        .trim()
        .min(1)
        .max(30)
        .transform((s) => s.replace(/^#/, "").toLowerCase()),
});
export async function addTag(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const { user } = await requireAuth();
    assertCan(user.role, "fans.edit");
    const parsed = tagSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: "Invalid tag" };
    const { fanId, name } = parsed.data;
    const tdb = getTenantDb(user.agencyId);
    const fan = await tdb.fan.findUnique({ where: { id: fanId } });
    if (!fan)
        return { error: "Fan not found" };
    await assertAccountAccess(tdb, user, fan.creatorAccountId);
    const tag = await tdb.fanTag.upsert({
        where: { agencyId_name: { agencyId: user.agencyId, name } },
        create: { agencyId: user.agencyId, name },
        update: {},
    });
    const existing = await tdb.fanTagLink.findFirst({
        where: { fanId, tagId: tag.id },
    });
    if (!existing) {
        await tdb.fanTagLink.create({
            data: { agencyId: user.agencyId, fanId, tagId: tag.id },
        });
        await logAudit(tdb, user.agencyId, {
            actorId: user.id,
            action: "fan.tag.add",
            entityType: "Fan",
            entityId: fanId,
            after: { fan: fan.username, tag: name },
        });
    }
    revalidatePath(`/fans/${fanId}`);
    return null;
}
export async function removeTag(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "fans.edit");
    const linkId = z.string().min(1).parse(formData.get("linkId"));
    const tdb = getTenantDb(user.agencyId);
    const link = await tdb.fanTagLink.findUnique({
        where: { id: linkId },
        include: { tag: true, fan: true },
    });
    if (!link)
        return;
    await assertAccountAccess(tdb, user, link.fan.creatorAccountId);
    await tdb.fanTagLink.delete({ where: { id: linkId } });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "fan.tag.remove",
        entityType: "Fan",
        entityId: link.fanId,
        before: { fan: link.fan.username, tag: link.tag.name },
    });
    revalidatePath(`/fans/${link.fanId}`);
}
