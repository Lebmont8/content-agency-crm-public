import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { can } from "@/auth/permissions";
export default async function SettingsIndex() {
    const { user } = await requireAuth();
    if (user.isPlatformAdmin || can(user.role, "users.manage")) {
        redirect("/settings/team");
    }
    redirect("/settings/security");
}
