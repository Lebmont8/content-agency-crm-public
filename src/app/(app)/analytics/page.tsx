import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { can } from "@/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/page-shell";
import { RevenueChart, SubscriberChart, type RevenuePoint, type SubscriberPoint } from "./charts";
import { formatCents } from "@/lib/utils";
const DAY = 24 * 60 * 60 * 1000;
export default async function AnalyticsPage() {
    const { user } = await requireAuth();
    if (!can(user.role, "finance.viewAgency"))
        redirect("/inbox");
    const { dict } = await getI18n();
    const a11n = dict.analytics;
    const tdb = getTenantDb(user.agencyId);
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY);
    const [transactions, accounts, topFans, fansForDynamics] = await Promise.all([
        tdb.transaction.findMany({
            where: { occurredAt: { gte: since30 } },
            select: { amountCents: true, type: true, occurredAt: true, creatorAccountId: true },
        }),
        tdb.creatorAccount.findMany({ select: { id: true, displayName: true } }),
        tdb.fan.findMany({
            orderBy: { totalSpentCents: "desc" },
            take: 10,
            include: { creatorAccount: { select: { displayName: true } } },
        }),
        tdb.fan.findMany({
            select: {
                subscribedAt: true,
                lastActiveAt: true,
                subscriptionStatus: true,
            },
        }),
    ]);
    const dayKey = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const revenueByDay = new Map<string, RevenuePoint>();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * DAY);
        revenueByDay.set(dayKey(d), {
            date: dayKey(d),
            subscriptions: 0,
            ppv: 0,
            tips: 0,
        });
    }
    for (const tx of transactions) {
        const point = revenueByDay.get(dayKey(tx.occurredAt));
        if (!point)
            continue;
        const dollars = tx.amountCents / 100;
        if (tx.type === "SUBSCRIPTION")
            point.subscriptions += dollars;
        else if (tx.type === "PPV")
            point.ppv += dollars;
        else
            point.tips += dollars;
    }
    const revenueData = [...revenueByDay.values()].map((p) => ({
        ...p,
        subscriptions: Math.round(p.subscriptions),
        ppv: Math.round(p.ppv),
        tips: Math.round(p.tips),
    }));
    const accountName = new Map(accounts.map((a) => [a.id, a.displayName]));
    const totals = new Map<string, {
        subscriptions: number;
        ppv: number;
        tips: number;
        total: number;
    }>();
    for (const tx of transactions) {
        const t = totals.get(tx.creatorAccountId) ??
            { subscriptions: 0, ppv: 0, tips: 0, total: 0 };
        if (tx.type === "SUBSCRIPTION")
            t.subscriptions += tx.amountCents;
        else if (tx.type === "PPV")
            t.ppv += tx.amountCents;
        else
            t.tips += tx.amountCents;
        t.total += tx.amountCents;
        totals.set(tx.creatorAccountId, t);
    }
    const accountRows = [...totals.entries()]
        .map(([id, t]) => ({ id, name: accountName.get(id) ?? "?", ...t }))
        .sort((a, b) => b.total - a.total);
    const grandTotal = accountRows.reduce((s, r) => s + r.total, 0);
    const weeks: SubscriberPoint[] = [];
    for (let w = 7; w >= 0; w--) {
        const start = new Date(now.getTime() - (w + 1) * 7 * DAY);
        const end = new Date(now.getTime() - w * 7 * DAY);
        const label = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        weeks.push({
            week: label,
            joined: fansForDynamics.filter((f) => f.subscribedAt >= start && f.subscribedAt < end).length,
            churned: fansForDynamics.filter((f) => f.subscriptionStatus === "EXPIRED" &&
                f.lastActiveAt >= start &&
                f.lastActiveAt < end).length,
        });
    }
    return (<div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader title={a11n.title} description={a11n.subtitle} actions={<div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">
          {a11n.last30}{" "}
          <span className="font-semibold text-success">{formatCents(grandTotal)}</span>
          </div>}/>

      <Card>
        <CardHeader>
          <CardTitle>{a11n.revenueByDay}</CardTitle>
          <CardDescription>{a11n.revenueByDayDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueChart data={revenueData}/>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{a11n.revenueByAccount}</CardTitle>
            <CardDescription>{a11n.revenueByAccountDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{a11n.account}</TH>
                  <TH className="text-right">{a11n.subs}</TH>
                  <TH className="text-right">{a11n.ppv}</TH>
                  <TH className="text-right">{a11n.tips}</TH>
                  <TH className="text-right">{a11n.total}</TH>
                </TR>
              </THead>
              <TBody>
                {accountRows.length === 0 && (<TR>
                    <TD colSpan={5} className="py-8 text-center text-muted">
                      {dict.common.noData}
                    </TD>
                  </TR>)}
                {accountRows.map((r) => (<TR key={r.id}>
                    <TD className="font-medium">{r.name}</TD>
                    <TD className="text-right text-muted">
                      {formatCents(r.subscriptions)}
                    </TD>
                    <TD className="text-right text-muted">{formatCents(r.ppv)}</TD>
                    <TD className="text-right text-muted">{formatCents(r.tips)}</TD>
                    <TD className="text-right font-medium text-success">
                      {formatCents(r.total)}
                    </TD>
                  </TR>))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{a11n.subscriberDynamics}</CardTitle>
            <CardDescription>{a11n.subscriberDynamicsDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriberChart data={weeks}/>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{a11n.topFans}</CardTitle>
          <CardDescription>{a11n.topFansDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>{a11n.fan}</TH>
                <TH>{a11n.account}</TH>
                <TH>{a11n.status}</TH>
                <TH className="text-right">{dict.common.lifetimeSpend}</TH>
              </TR>
            </THead>
            <TBody>
              {topFans.length === 0 && (<TR>
                  <TD colSpan={5} className="py-8 text-center text-muted">
                    {dict.common.noData}
                  </TD>
                </TR>)}
              {topFans.map((f, i) => (<TR key={f.id}>
                  <TD className="text-muted">{i + 1}</TD>
                  <TD>
                    <Link href={`/fans/${f.id}`} className="font-medium text-primary hover:underline">
                      {f.displayName}
                    </Link>{" "}
                    <span className="text-xs text-muted">@{f.username}</span>
                  </TD>
                  <TD className="text-muted">{f.creatorAccount.displayName}</TD>
                  <TD>
                    <Badge variant={f.subscriptionStatus === "ACTIVE" ? "success" : "danger"}>
                      {f.subscriptionStatus === "ACTIVE"
                ? dict.settings.active
                : dict.segments.expired}
                    </Badge>
                  </TD>
                  <TD className="text-right font-semibold text-success">
                    {formatCents(f.totalSpentCents)}
                  </TD>
                </TR>))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>);
}
