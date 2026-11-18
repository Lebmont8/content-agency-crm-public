import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-shell";
export default async function OnboardingPage() {
    const { user, agency } = await requireAuth();
    const { dict } = await getI18n();
    const t = dict.onboarding;
    const tdb = getTenantDb(user.agencyId);
    const [memberCount, accountCount] = await Promise.all([
        tdb.user.count({ where: { isActive: true } }),
        tdb.creatorAccount.count(),
    ]);
    const steps = [
        {
            title: t.step1Title,
            description: t.step1Desc,
            href: "/settings/team",
            done: memberCount > 1,
        },
        {
            title: t.step2Title,
            description: t.step2Desc,
            href: "/settings/accounts",
            done: accountCount > 0,
        },
        {
            title: t.step3Title,
            description: t.step3Desc,
            href: "/inbox",
            done: false,
        },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    return (<div className="mx-auto max-w-2xl">
      <PageHeader title={`${t.welcome} ${agency.name}`} description={t.subtitle}/>
      <div className="mb-7 mt-6">
        <div className="mb-1 text-xs text-muted">
          {doneCount} / {steps.length}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }}/>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {steps.map((s, i) => (<Link key={s.href} href={s.href}>
            <Card className="transition-all hover:-translate-y-0.5 hover:border-primary/40">
              <CardHeader className="flex-row items-center justify-between">
                <div className="flex items-start gap-3">
                  <span className={s.done
                ? "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-success/20 text-xs text-success"
                : "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-muted"}>
                    {s.done ? "✓" : i + 1}
                  </span>
                  <div>
                    <CardTitle>{s.title}</CardTitle>
                    <CardDescription className="mt-1">{s.description}</CardDescription>
                  </div>
                </div>
                {s.done && <Badge variant="success">{t.done}</Badge>}
              </CardHeader>
            </Card>
          </Link>))}
      </div>
    </div>);
}
