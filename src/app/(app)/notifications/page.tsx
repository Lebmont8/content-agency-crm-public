import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getAccessibleAccountIds } from "@/domain/access";
import { getI18n } from "@/i18n";
import { PageHeader } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { markAllNotificationsRead, openNotification } from "./actions";
export default async function NotificationsPage() {
    const { user } = await requireAuth();
    const { dict } = await getI18n();
    const t = dict.notifications;
    const tdb = getTenantDb(user.agencyId);
    const accountIds = await getAccessibleAccountIds(tdb, user);
    const [events, unreadConversations] = await Promise.all([
        tdb.internalNotification.findMany({
            where: { recipientUserId: user.id },
            orderBy: { createdAt: "desc" },
            take: 100,
            include: { creatorAccount: { select: { displayName: true } } },
        }),
        accountIds.length
            ? tdb.conversation.findMany({
                where: { creatorAccountId: { in: accountIds }, unreadCount: { gt: 0 } },
                orderBy: { lastMessageAt: "desc" },
                take: 50,
                include: {
                    fan: { select: { displayName: true } },
                    creatorAccount: { select: { displayName: true } },
                },
            })
            : Promise.resolve([]),
    ]);
    return (<div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title={t.title} description={t.subtitle} actions={events.some((event) => event.readAt === null) ? (<form action={markAllNotificationsRead}>
              <Button type="submit" size="sm" variant="secondary">{t.markAllRead}</Button>
            </form>) : undefined}/>

      {unreadConversations.length > 0 && (<Card>
          <CardContent className="grid gap-2 pt-4">
            <h2 className="text-sm font-semibold">{t.unreadMessages}</h2>
            {unreadConversations.map((conversation) => (<Link key={conversation.id} href={`/inbox/${conversation.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
                <span>{conversation.fan.displayName} · {conversation.creatorAccount.displayName}</span>
                <Badge variant="default">{conversation.unreadCount}</Badge>
              </Link>))}
          </CardContent>
        </Card>)}

      <div className="grid gap-2">
        {events.length === 0 && <p className="rounded-xl border border-border p-6 text-center text-sm text-muted">{t.noNotifications}</p>}
        {events.map((event) => (<form key={event.id} action={openNotification}>
            <input type="hidden" name="notificationId" value={event.id}/>
            <button type="submit" className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-surface-2 ${event.readAt ? "border-border opacity-70" : "border-primary/35 bg-primary/[0.06]"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{event.title || t.eventLabels[event.type as keyof typeof t.eventLabels] || event.type}</span>
                <span className="text-xs text-muted">{formatDateTime(event.createdAt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                {event.creatorAccount?.displayName && <Badge variant="secondary">{event.creatorAccount.displayName}</Badge>}
                {event.body && <span>{event.body}</span>}
              </div>
            </button>
          </form>))}
      </div>
    </div>);
}
