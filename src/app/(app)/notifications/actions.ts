"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
export async function markAllNotificationsRead(): Promise<void> {
    const { user } = await requireAuth();
    const tdb = getTenantDb(user.agencyId);
    await tdb.internalNotification.updateMany({
        where: { recipientUserId: user.id, readAt: null },
        data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
}
export async function openNotification(formData: FormData): Promise<void> {
    const { user } = await requireAuth();
    const id = z.string().min(1).parse(formData.get("notificationId"));
    const tdb = getTenantDb(user.agencyId);
    const notification = await tdb.internalNotification.findFirst({
        where: { id, recipientUserId: user.id },
        select: { id: true, actionPath: true },
    });
    if (!notification)
        redirect("/notifications");
    await tdb.internalNotification.update({
        where: { id: notification.id },
        data: { readAt: new Date() },
    });
    const path = notification.actionPath;
    redirect(path?.startsWith("/") && !path.startsWith("//") ? path : "/notifications");
}
