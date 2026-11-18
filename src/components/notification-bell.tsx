import Link from "next/link";
import { Bell } from "lucide-react";
import type { Role } from "@prisma/client";
import { getTenantDb } from "@/lib/tenant-db";
import { getAccessibleAccountIds } from "@/domain/access";
export async function NotificationBell({ agencyId, user, label, }: {
    agencyId: string;
    user: {
        id: string;
        role: Role;
    };
    label: string;
}) {
    const tdb = getTenantDb(agencyId);
    const accountIds = await getAccessibleAccountIds(tdb, user);
    const [events, messages] = await Promise.all([
        tdb.internalNotification.count({
            where: { recipientUserId: user.id, readAt: null },
        }),
        accountIds.length
            ? tdb.conversation.aggregate({
                where: { creatorAccountId: { in: accountIds }, unreadCount: { gt: 0 } },
                _sum: { unreadCount: true },
            })
            : Promise.resolve({ _sum: { unreadCount: 0 } }),
    ]);
    const count = events + (messages._sum.unreadCount ?? 0);
    return (<Link href="/notifications" className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground" aria-label={label} title={label}>
      <Bell className="h-4 w-4"/>
      {count > 0 && (<span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>)}
    </Link>);
}
