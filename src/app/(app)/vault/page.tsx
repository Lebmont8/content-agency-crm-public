import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getAccessibleAccounts } from "@/domain/access";
import { can } from "@/auth/permissions";
import { CreateItemForm } from "./forms";
export default async function VaultPage({ searchParams }: {
    searchParams: Promise<{
        account?: string;
        q?: string;
    }>;
}) {
    const { user } = await requireAuth();
    const tdb = getTenantDb(user.agencyId);
    const accounts = await getAccessibleAccounts(tdb, user);
    const params = await searchParams;
    const account = accounts.find(a => a.id === params.account) ?? accounts[0];
    if (!account)
        return <section><h1>Content library</h1><p>Connect an account before adding content metadata.</p></section>;
    const items = await tdb.vaultItem.findMany({ where: { creatorAccountId: account.id, ...(params.q ? { title: { contains: params.q, mode: "insensitive" } } : {}) }, orderBy: { title: "asc" } });
    return <section className="space-y-6"><h1 className="text-2xl font-semibold">Content library</h1><nav className="flex gap-3">{accounts.map(a => <a key={a.id} href={"/vault?account=" + encodeURIComponent(a.id)}>{a.displayName}</a>)}</nav>{can(user.role, "vault.manage") && <CreateItemForm accountId={account.id}/>}<div className="grid gap-3">{items.map(i => <article key={i.id} className="rounded-xl border p-4"><h2 className="font-medium">{i.title}</h2><p>{i.mediaType} · {(i.defaultPriceCents / 100).toFixed(2)}</p></article>)}</div></section>;
}
