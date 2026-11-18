"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Clock3, Compass, CreditCard, Gauge, ImageIcon, Inbox, ScrollText, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
export type NavIcon = "compass" | "inbox" | "vault" | "shifts" | "kpi" | "analytics" | "audit" | "billing" | "settings" | "admin";
export type NavItem = {
    href: string;
    label: string;
    icon?: NavIcon;
};
const NAV_ICONS: Record<NavIcon, LucideIcon> = {
    compass: Compass,
    inbox: Inbox,
    vault: ImageIcon,
    shifts: Clock3,
    kpi: Gauge,
    analytics: BarChart3,
    audit: ScrollText,
    billing: CreditCard,
    settings: Settings,
    admin: ShieldCheck,
};
export function NavLinks({ items, className, orientation = "vertical", }: {
    items: NavItem[];
    className?: string;
    orientation?: "vertical" | "horizontal";
}) {
    const pathname = usePathname();
    return (<nav className={cn("flex gap-1", orientation === "vertical"
            ? "flex-col"
            : "flex-row overflow-x-auto pb-1", className)}>
      {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon ? NAV_ICONS[item.icon] : null;
            return (<Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("group flex min-h-10 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-all duration-200", active
                    ? "bg-primary/12 font-medium text-foreground shadow-[inset_0_0_0_1px_rgba(139,92,246,0.18)]"
                    : "text-muted hover:bg-white/[0.035] hover:text-foreground")}>
            {Icon && (<Icon className={cn("h-[17px] w-[17px] shrink-0 transition-colors", active ? "text-primary" : "text-muted group-hover:text-foreground")} strokeWidth={1.8}/>)}
            {item.label}
          </Link>);
        })}
    </nav>);
}
