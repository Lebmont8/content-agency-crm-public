import Link from "next/link";
import type { AuthContext } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { getAccessibleAccounts } from "@/domain/access";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/page-shell";
import { MessagesSquare } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
export interface InboxFilters {
    account?: string;
    tag?: string;
    queue?: string;
}
function filterHref(filters: InboxFilters, patch: Partial<InboxFilters>): string {
    const params = new URLSearchParams();
    const merged = { ...filters, ...patch };
    if (merged.account)
        params.set("account", merged.account);
    if (merged.tag)
        params.set("tag", merged.tag);
    if (merged.queue)
        params.set("queue", merged.queue);
    const qs = params.toString();
    return qs ? `/inbox?${qs}` : "/inbox";
}
export async function ConversationList({ auth, filters, activeId, }: {
    auth: AuthContext;
    filters: InboxFilters;
    activeId?: string;
}) {
    const tdb = getTenantDb(auth.user.agencyId);
    const { dict } = await getI18n();
    const accounts = await getAccessibleAccounts(tdb, auth.user);
    const accountIds = accounts.map((a) => a.id);
    const selectedAccountIds = filters.account && accountIds.includes(filters.account)
        ? [filters.account]
        : accountIds;
    const tags = await tdb.fanTag.findMany({ orderBy: { name: "asc" } });
    const selectedTag = tags.find((tag) => tag.id === filters.tag);
    const conversationWhere = {
        creatorAccountId: { in: selectedAccountIds },
        ...(selectedTag
            ? { fan: { tagLinks: { some: { tagId: selectedTag.id } } } }
            : {}),
        ...(filters.queue === "handoff"
            ? { handoffStatus: { not: null } }
            : {}),
    };
    const [conversations, unreadHandoffs, handoffCount] = await Promise.all([
        tdb.conversation.findMany({
            where: conversationWhere,
            orderBy: filters.queue === "handoff"
                ? [{ handoffSlaDueAt: "asc" }, { handoffRequestedAt: "asc" }]
                : { lastMessageAt: "desc" },
            take: 200,
            include: {
                fan: {
                    include: {
                        tagLinks: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
                    },
                },
                creatorAccount: { select: { displayName: true } },
                assignedUser: { select: { name: true } },
                messages: { orderBy: { sentAt: "desc" }, take: 1 },
            },
        }),
        tdb.internalNotification.count({
            where: {
                recipientUserId: auth.user.id,
                type: "HANDOFF_REQUESTED",
                readAt: null,
            },
        }),
        tdb.conversation.count({
            where: {
                creatorAccountId: { in: selectedAccountIds },
                handoffStatus: { not: null },
            },
        }),
    ]);
    const visible = conversations;
    return (<div className={cn("h-full min-w-0 shrink-0 flex-col border-r border-border/80 bg-background/35", activeId ? "hidden w-80 md:flex" : "flex w-full md:w-80")}>
      <div className="border-b border-border/80 bg-surface/35 p-3 backdrop-blur-sm">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-[10px] bg-surface-2 p-1 text-xs">
          <Link href={filterHref(filters, { queue: undefined })} className={cn("rounded-lg px-2 py-1.5 text-center transition-colors", filters.queue !== "handoff"
            ? "bg-surface font-medium text-foreground"
            : "text-muted hover:text-foreground")}>
            {dict.inbox.allChats}
          </Link>
          <Link href={filterHref(filters, { queue: "handoff" })} className={cn("rounded-lg px-2 py-1.5 text-center transition-colors", filters.queue === "handoff"
            ? "bg-surface font-medium text-warning"
            : "text-muted hover:text-foreground")}>
            {dict.inbox.handoffQueue} {handoffCount}
            {unreadHandoffs > 0 ? ` · ${unreadHandoffs}` : ""}
          </Link>
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          <Link href={filterHref(filters, { account: undefined })} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", !filters.account
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border text-muted hover:text-foreground")}>
            {dict.common.allAccounts}
          </Link>
          {accounts.map((a) => (<Link key={a.id} href={filterHref(filters, { account: a.id })} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", filters.account === a.id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted hover:text-foreground")}>
              {a.displayName}
            </Link>))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Link href={filterHref(filters, { tag: undefined })} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", !selectedTag
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border text-muted hover:text-foreground")}>
            {dict.common.all}
          </Link>
          {tags.map((tag) => (<Link key={tag.id} href={filterHref(filters, { tag: tag.id })} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", selectedTag?.id === tag.id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted hover:text-foreground")}>
              #{tag.name}
            </Link>))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 && (<EmptyState compact icon={<MessagesSquare className="h-5 w-5"/>} title={dict.inbox.noConversations} description={<>
                {selectedTag ? `${dict.inbox.inTag} “#${selectedTag.name}”. ` : ""}
                {accounts.length === 0 && dict.inbox.notAssigned}
              </>} action={accounts.length === 0 ? (<Link href="/onboarding" className={buttonVariants({ size: "sm" })}>
                  {dict.inbox.getStartedCta}
                </Link>) : undefined} className="m-3 min-h-0"/>)}
        {visible.map((convo) => {
            const last = convo.messages[0];
            return (<Link key={convo.id} href={`/inbox/${convo.id}`} className={cn("block border-b border-border/55 px-3 py-3 transition-colors hover:bg-surface-2/60", activeId === convo.id && "bg-primary/[0.07] shadow-[inset_3px_0_0_var(--color-primary)]")}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {convo.fan.displayName}
                  <span className="ml-1.5 text-xs font-normal text-muted">
                    @{convo.fan.username}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  {timeAgo(convo.lastMessageAt)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted">
                  {last
                    ? `${last.direction === "OUT" ? `${dict.inbox.you}: ` : ""}${last.body}`
                    : "—"}
                </span>
                {convo.unreadCount > 0 && (<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {convo.unreadCount}
                  </span>)}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <Badge variant="secondary">{convo.creatorAccount.displayName}</Badge>
                {convo.fan.tagLinks.map((link) => (<Badge key={link.id} variant="secondary">
                    #{link.tag.name}
                  </Badge>))}
              </div>
              {convo.handoffStatus && (<div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className={convo.handoffSlaDueAt && convo.handoffSlaDueAt < new Date()
                        ? "font-medium text-danger"
                        : "font-medium text-warning"}>
                    {convo.handoffStatus === "REQUESTED"
                        ? dict.inbox.handoffRequested
                        : dict.inbox.handoffTakenOver}
                  </span>
                  <span className="truncate text-muted">
                    {convo.assignedUser?.name ?? dict.inbox.handoffUnassigned}
                  </span>
                  {convo.handoffRequestedAt && (<span className="text-muted">
                      {dict.inbox.handoffAge} {timeAgo(convo.handoffRequestedAt)}
                    </span>)}
                  {convo.handoffSlaDueAt && convo.handoffSlaDueAt < new Date() && (<span className="text-danger">{dict.inbox.handoffSlaBreached}</span>)}
                </div>)}
            </Link>);
        })}
      </div>
    </div>);
}
