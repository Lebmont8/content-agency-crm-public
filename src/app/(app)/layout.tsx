import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getI18n } from "@/i18n";
import { can } from "@/auth/permissions";
import { paymentState } from "@/domain/commission";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { BrandLockup } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { logout } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavigationBack } from "@/components/navigation-back";
import { NotificationBell } from "@/components/notification-bell";
export default async function AppLayout({ children, }: {
    children: React.ReactNode;
}) {
    const { user, agency } = await requireAuth();
    const { dict } = await getI18n();
    const pay = paymentState(agency.dueDate, agency.paymentPending);
    const blocked = agency.suspended;
    if (blocked && !user.isPlatformAdmin) {
        return (<div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md rounded-lg border border-danger/40 bg-surface p-6 text-center">
          <div className="text-2xl">⛔</div>
          <h1 className="mt-2 text-lg font-semibold text-danger">
            {dict.common.suspendedTitle}
          </h1>
          <p className="mt-2 text-sm text-muted">{dict.common.suspendedBody}</p>
          <form action={logout} className="mt-4">
            <Button variant="secondary" type="submit">
              {dict.common.signOut}
            </Button>
          </form>
        </div>
      </div>);
    }
    const showPayReminder = (pay === "overdue" || pay === "blocked" || pay === "pending_confirm") &&
        can(user.role, "billing.manage");
    const items: NavItem[] = [];
    items.push({ href: "/inbox", label: dict.nav.inbox, icon: "inbox" });
    items.push({ href: "/vault", label: dict.nav.vault, icon: "vault" });
    items.push({ href: "/shifts", label: dict.nav.shifts, icon: "shifts" });
    items.push({ href: "/kpi", label: dict.nav.kpi, icon: "kpi" });
    if (can(user.role, "finance.viewAgency"))
        items.push({ href: "/analytics", label: dict.nav.analytics, icon: "analytics" });
    if (can(user.role, "audit.view"))
        items.push({ href: "/audit", label: dict.nav.audit, icon: "audit" });
    if (can(user.role, "billing.manage"))
        items.push({ href: "/billing", label: dict.nav.billing, icon: "billing" });
    items.push({ href: "/settings", label: dict.nav.settings, icon: "settings" });
    if (user.isPlatformAdmin)
        items.push({ href: "/admin", label: dict.nav.admin, icon: "admin" });
    return (<div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border/80 bg-surface/90 px-4 py-5 shadow-[18px_0_60px_rgba(0,0,0,0.16)] backdrop-blur-xl lg:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <BrandLockup name={dict.common.appName} subtitle={agency.name} compact/>
        </div>
        <NavLinks items={items}/>
        <div className="mt-auto pt-5">
          <div className="rounded-2xl border border-border bg-surface-2/65 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <Badge variant="secondary" className="mt-1.5">
                  {dict.roles[user.role]}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell agencyId={user.agencyId} user={user} label={dict.notifications.title}/>
                <LanguageSwitcher />
              </div>
            </div>
            <form action={logout} className="mt-3 border-t border-border/70 pt-2">
              <Button variant="ghost" size="sm" type="submit" className="w-full justify-start text-muted">
                <LogOut className="h-3.5 w-3.5"/>
                {dict.common.signOut}
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/80 bg-background/85 px-4 backdrop-blur-xl lg:hidden">
        <BrandLockup name={dict.common.appName} subtitle={agency.name} compact/>
        <div className="flex items-center gap-2">
          <NotificationBell agencyId={user.agencyId} user={user} label={dict.notifications.title}/>
        <details className="group relative">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-[10px] border border-border bg-surface text-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <Menu className="h-5 w-5"/>
            <span className="sr-only">{dict.common.menu}</span>
          </summary>
          <div className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface/95 p-3 shadow-2xl backdrop-blur-xl">
            <NavLinks items={items}/>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {dict.roles[user.role]}
                </div>
              </div>
              <LanguageSwitcher />
            </div>
            <form action={logout} className="mt-2">
              <Button variant="ghost" size="sm" type="submit" className="w-full justify-start text-muted">
                <LogOut className="h-3.5 w-3.5"/>
                {dict.common.signOut}
              </Button>
            </form>
          </div>
        </details>
        </div>
      </header>

      <main className="min-w-0 px-4 pb-6 pt-4 sm:px-6 sm:pb-8 lg:ml-64 lg:px-8 lg:py-8">
        {showPayReminder && (<Link href="/billing" className="mb-5 block rounded-xl border border-warning/35 bg-warning/[0.08] px-4 py-3 text-sm text-warning transition-colors hover:bg-warning/[0.12]">
            {pay === "pending_confirm"
                ? `⏳ ${dict.billing.awaitingConfirm}`
                : pay === "blocked"
                    ? `⛔ ${dict.billing.aiSuspendedMsg}`
                    : `⚠ ${dict.billing.overdueMsg}`}
          </Link>)}
        <NavigationBack label={dict.common.back}/>
        {children}
      </main>
    </div>);
}
