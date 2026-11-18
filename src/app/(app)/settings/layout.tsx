import { requireAuth } from "@/lib/session";
import { getI18n } from "@/i18n";
import { can } from "@/auth/permissions";
import { NavLinks } from "@/components/nav-links";
import { PageHeader } from "@/components/page-shell";
export default async function SettingsLayout({ children, }: {
    children: React.ReactNode;
}) {
    const { user } = await requireAuth();
    const { dict } = await getI18n();
    const items = [
        ...(user.isPlatformAdmin || can(user.role, "users.manage")
            ? [{ href: "/settings/team", label: dict.settings.team }]
            : []),
        ...(user.isPlatformAdmin || can(user.role, "assignments.manage")
            ? [
                { href: "/settings/accounts", label: dict.settings.creatorAccounts },
                { href: "/settings/tags", label: dict.settings.customTags },
            ]
            : []),
        ...(user.role === "OWNER"
            ? [
                {
                    href: "/settings/connectors",
                    label: dict.settings.desktopConnectors,
                },
            ]
            : []),
        { href: "/settings/notifications", label: dict.notifications.settingsTab },
        { href: "/settings/security", label: dict.mfa.security },
    ];
    return (<div className="mx-auto max-w-5xl">
      <PageHeader title={dict.settings.title} description={dict.settings.subtitle}/>
      <div className="my-6 border-b border-border">
        <NavLinks items={items} orientation="horizontal"/>
      </div>
      {children}
    </div>);
}
