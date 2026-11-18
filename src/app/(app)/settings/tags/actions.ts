"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { assertCan } from "@/auth/permissions";
import { logAudit } from "@/domain/audit";
const tagName = z
    .string()
    .trim()
    .min(1)
    .max(30)
    .transform((value) => value.replace(/^#/, "").trim().toLowerCase());
function refreshTags(): void {
    revalidatePath("/settings/tags");
    revalidatePath("/inbox");
    revalidatePath("/fans");
}
export async function createTag(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "assignments.manage");
    const name = tagName.parse(formData.get("name"));
    const tdb = getTenantDb(user.agencyId);
    const existing = await tdb.fanTag.findUnique({
        where: { agencyId_name: { agencyId: user.agencyId, name } },
    });
    if (existing)
        return;
    const tag = await tdb.fanTag.create({
        data: { agencyId: user.agencyId, name },
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "fan.tag.create",
        entityType: "FanTag",
        entityId: tag.id,
        after: { name },
    });
    refreshTags();
}
export async function renameTag(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "assignments.manage");
    const data = z.object({ id: z.string().min(1), name: tagName }).parse(Object.fromEntries(formData));
    const tdb = getTenantDb(user.agencyId);
    const before = await tdb.fanTag.findUnique({ where: { id: data.id } });
    if (!before || before.name === data.name)
        return;
    const duplicate = await tdb.fanTag.findUnique({
        where: { agencyId_name: { agencyId: user.agencyId, name: data.name } },
    });
    if (duplicate)
        return;
    await tdb.fanTag.update({ where: { id: before.id }, data: { name: data.name } });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "fan.tag.update",
        entityType: "FanTag",
        entityId: before.id,
        before: { name: before.name },
        after: { name: data.name },
    });
    refreshTags();
}
export async function deleteTag(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    assertCan(user.role, "assignments.manage");
    const id = z.string().min(1).parse(formData.get("id"));
    const tdb = getTenantDb(user.agencyId);
    const tag = await tdb.fanTag.findUnique({
        where: { id },
        include: { _count: { select: { links: true } } },
    });
    if (!tag)
        return;
    await tdb.fanTag.delete({ where: { id: tag.id } });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "fan.tag.delete",
        entityType: "FanTag",
        entityId: tag.id,
        before: { name: tag.name, linkedFans: tag._count.links },
    });
    refreshTags();
}
