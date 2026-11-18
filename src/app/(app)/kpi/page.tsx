import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { can } from "@/auth/permissions";
import { computeKpi, periodStart, type Period } from "@/domain/kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/page-shell";
import { cn, formatCents } from "@/lib/utils";
function Stat({ label, value, hint }: {
    label: string;
    value: string;
    hint?: string;
}) {
    return (<Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </div>
        <div className="mt-1 text-xl font-bold">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </CardContent>
    </Card>);
}
export default async function KpiPage({ searchParams, }: {
    searchParams: Promise<{
        period?: string;
    }>;
}) {
    const { user } = await requireAuth();
    const { dict } = await getI18n();
    const k = dict.kpi;
    const PERIODS: Array<{
        key: Period;
        label: string;
    }> = [
        { key: "day", label: k.period24h },
        { key: "week", label: k.period7d },
        { key: "month", label: k.period30d },
    ];
    const { period: periodParam } = await searchParams;
    const period: Period = (["day", "week", "month"] as const).includes(periodParam as Period)
        ? (periodParam as Period)
        : "week";
    const since = periodStart(period);
    const tdb = getTenantDb(user.agencyId);
    const seesAll = can(user.role, "kpi.viewAll");
    const [transactions, sends, chatters, accounts] = await Promise.all([
        tdb.transaction.findMany({
            where: {
                occurredAt: { gte: since },
                ...(seesAll ? {} : { closedByUserId: user.id }),
            },
            select: {
                amountCents: true,
                type: true,
                closedByUserId: true,
                creatorAccountId: true,
            },
        }),
        tdb.vaultSend.findMany({
            where: {
                sentAt: { gte: since },
                ...(seesAll ? {} : { sentByUserId: user.id }),
            },
            select: { sentByUserId: true, purchasedAt: true },
        }),
        seesAll
            ? tdb.user.findMany({
                where: { role: "CHATTER", isActive: true },
                select: { id: true, name: true },
            })
            : Promise.resolve([]),
        tdb.creatorAccount.findMany({ select: { id: true, displayName: true } }),
    ]);
    const ownKpi = computeKpi(transactions.filter((t) => t.closedByUserId === user.id), sends.filter((s) => s.sentByUserId === user.id));
    const accountName = new Map(accounts.map((a) => [a.id, a.displayName]));
    const byAccount = new Map<string, typeof transactions>();
    for (const t of transactions) {
        const arr = byAccount.get(t.creatorAccountId) ?? [];
        arr.push(t);
        byAccount.set(t.creatorAccountId, arr);
    }
    return (<div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader title={k.title} description={k.subtitle} actions={<div className="flex gap-1.5">
          {PERIODS.map((p) => (<Link key={p.key} href={`/kpi?period=${p.key}`} className={cn("rounded-full border px-3 py-1 text-xs", period === p.key
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border text-muted hover:text-foreground")}>
              {p.label}
            </Link>))}
        </div>}/>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          {seesAll ? k.myCloses : k.myPerformance}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={k.revenueClosed} value={formatCents(ownKpi.revenueCents)}/>
          <Stat label={k.ppvClosed} value={String(ownKpi.ppvClosed)} hint={`${ownKpi.ppvSent} ${k.sentSuffix}`}/>
          <Stat label={k.conversion} value={`${ownKpi.conversionPct}%`}/>
          <Stat label={k.avgPpvCheck} value={formatCents(ownKpi.avgPpvCheckCents)}/>
        </div>
      </div>

      {seesAll && (<Card>
          <CardHeader>
            <CardTitle>{k.chatterComparison}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{k.chatter}</TH>
                  <TH className="text-right">{k.revenue}</TH>
                  <TH className="text-right">{k.ppvSent}</TH>
                  <TH className="text-right">{k.ppvClosed}</TH>
                  <TH className="text-right">{k.conversion}</TH>
                  <TH className="text-right">{k.avgCheck}</TH>
                </TR>
              </THead>
              <TBody>
                {chatters.length === 0 && (<TR>
                    <TD colSpan={6} className="py-8 text-center text-muted">
                      {dict.common.noData}
                    </TD>
                  </TR>)}
                {chatters.map((c) => {
                const kpi = computeKpi(transactions.filter((t) => t.closedByUserId === c.id), sends.filter((s) => s.sentByUserId === c.id));
                return (<TR key={c.id}>
                      <TD className="font-medium">{c.name}</TD>
                      <TD className="text-right font-medium text-success">
                        {formatCents(kpi.revenueCents)}
                      </TD>
                      <TD className="text-right">{kpi.ppvSent}</TD>
                      <TD className="text-right">{kpi.ppvClosed}</TD>
                      <TD className="text-right">{kpi.conversionPct}%</TD>
                      <TD className="text-right">{formatCents(kpi.avgPpvCheckCents)}</TD>
                    </TR>);
            })}
              </TBody>
            </Table>
          </CardContent>
        </Card>)}

      <Card>
        <CardHeader>
          <CardTitle>{k.byAccount}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>{k.account}</TH>
                <TH className="text-right">{k.revenue}</TH>
                <TH className="text-right">{k.subs}</TH>
                <TH className="text-right">{k.ppv}</TH>
                <TH className="text-right">{k.tips}</TH>
              </TR>
            </THead>
            <TBody>
              {byAccount.size === 0 && (<TR>
                  <TD colSpan={5} className="py-8 text-center text-muted">
                    {dict.common.noData}
                  </TD>
                </TR>)}
              {[...byAccount.entries()]
            .map(([accountId, txs]) => ({
            accountId,
            kpi: computeKpi(txs, []),
        }))
            .sort((a, b) => b.kpi.revenueCents - a.kpi.revenueCents)
            .map(({ accountId, kpi }) => (<TR key={accountId}>
                    <TD className="font-medium">
                      {accountName.get(accountId) ?? "?"}
                    </TD>
                    <TD className="text-right font-medium text-success">
                      {formatCents(kpi.revenueCents)}
                    </TD>
                    <TD className="text-right">
                      {formatCents(kpi.subscriptionRevenueCents)}
                    </TD>
                    <TD className="text-right">{formatCents(kpi.ppvRevenueCents)}</TD>
                    <TD className="text-right">{formatCents(kpi.tipRevenueCents)}</TD>
                  </TR>))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>);
}
