import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { CreateAccountForm } from "./create-form";
export default async function AccountsPage() {
    const { user } = await requireAuth();
    const accounts = await getTenantDb(user.agencyId).creatorAccount.findMany({ orderBy: { displayName: "asc" } });
    return <section className="space-y-6"><h1 className="text-2xl font-semibold">Connected accounts</h1><CreateAccountForm /><div className="space-y-3">{accounts.map(a => <article key={a.id} className="rounded-xl border p-4"><h2 className="font-medium">{a.displayName}</h2><p>{a.platform}</p></article>)}</div><p className="text-sm text-muted-foreground">This source edition supports manual workflows. Commercial automation and its configuration are not distributed.</p></section>;
}
