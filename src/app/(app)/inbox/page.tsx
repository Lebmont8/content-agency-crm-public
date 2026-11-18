import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getI18n } from "@/i18n";
import { getTenantDb } from "@/lib/tenant-db";
import { getAccessibleAccounts } from "@/domain/access";
import { can } from "@/auth/permissions";
import { Button } from "@/components/ui/button";
import { ConversationList } from "./conversation-list";
export default async function InboxPage({ searchParams, }: {
    searchParams: Promise<{
        account?: string;
        tag?: string;
        queue?: string;
    }>;
}) {
    const auth = await requireAuth();
    const { dict } = await getI18n();
    const filters = await searchParams;
    const tdb = getTenantDb(auth.user.agencyId);
    const accounts = await getAccessibleAccounts(tdb, auth.user);
    const canSetUp = accounts.length === 0 && can(auth.user.role, "assignments.manage");
    return (<>
      <ConversationList auth={auth} filters={filters}/>
      <div className="hidden flex-1 items-center justify-center p-6 md:flex">
        {canSetUp ? (<div className="max-w-sm rounded-2xl border border-dashed border-border bg-surface/40 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-xl">
              ✦
            </div>
            <h2 className="mt-4 text-base font-semibold">
              {dict.inbox.getStartedTitle}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {dict.inbox.getStartedBody}
            </p>
            <Link href="/onboarding" className="mt-4 inline-block">
              <Button>{dict.inbox.getStartedCta}</Button>
            </Link>
          </div>) : (<div className="text-center">
            <div className="mx-auto mb-3 h-2 w-2 rounded-full bg-primary shadow-[0_0_18px_rgba(155,122,248,0.8)]"/>
            <p className="text-sm text-muted">{dict.inbox.selectConversation}</p>
          </div>)}
      </div>
    </>);
}
