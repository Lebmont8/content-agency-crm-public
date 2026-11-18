import { requirePlatformAdmin, listAgenciesForAdmin, getAdminDashboardSummary } from "@/lib/admin";
import { getI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-shell";
import { suspendAgency, confirmAgencyPayment, updatePricing, toggleAgencyPilot, saveCreatorPilotPolicy } from "./actions";
import { formatCents, formatDate } from "@/lib/utils";
export default async function AdminPage() {
    await requirePlatformAdmin();
    const { dict } = await getI18n();
    const t = dict.admin;
    const [agencies, summary] = await Promise.all([
        listAgenciesForAdmin(),
        getAdminDashboardSummary(),
    ]);
    const growthLabel = (value: number | null) => value === null ? t.growthNew : `${value >= 0 ? "+" : ""}${value}%`;
    return (<div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PageHeader title={t.title} description={t.subtitle}/>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
            [t.owners, summary.owners, `${summary.agencies} ${t.agencies}`],
            [t.models, summary.models, `${summary.activeAi} ${t.activeAi}`],
            [
                t.paidOwners,
                summary.paidAgencies,
                `${summary.pendingAgencies} ${t.pendingShort} · ${summary.overdueAgencies} ${t.overdueShort}`,
            ],
            [t.crmRevenue, formatCents(summary.revenueCents), t.currentPeriod],
        ].map(([label, value, hint]) => (<Card key={String(label)}>
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">
                {label}
              </div>
              <div className="mt-1 text-2xl font-bold">{value}</div>
              <div className="mt-1 text-xs text-muted">{hint}</div>
            </CardContent>
          </Card>))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.growthTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-2/60 p-3">
            <div className="text-xs text-muted">{t.newOwners}</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-xl font-semibold">{summary.newAgencies}</span>
              <Badge variant={summary.agencyGrowthPercent !== null && summary.agencyGrowthPercent < 0 ? "danger" : "success"}>
                {growthLabel(summary.agencyGrowthPercent)}
              </Badge>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-2/60 p-3">
            <div className="text-xs text-muted">{t.newModels}</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-xl font-semibold">{summary.newModels}</span>
              <Badge variant={summary.modelGrowthPercent !== null && summary.modelGrowthPercent < 0 ? "danger" : "success"}>
                {growthLabel(summary.modelGrowthPercent)}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {agencies.map((a) => (<Card key={a.id}>
          <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {a.name}
                {a.suspended ? (<Badge variant="danger">{t.suspended}</Badge>) : (<Badge variant="success">{t.active}</Badge>)}
                <Badge variant={a.pilotEnabled ? "success" : "secondary"}>
                  {a.pilotEnabled ? t.pilotEnabled : t.pilotDisabled}
                </Badge>
                {a.paymentState === "pending_confirm" && (<Badge variant="default">{t.paymentPending}</Badge>)}
                {a.paymentState === "overdue" && (<Badge variant="warning">{t.overdue}</Badge>)}
                {a.paymentState === "blocked" && (<Badge variant="danger">{t.aiBlocked}</Badge>)}
              </CardTitle>
              <p className="mt-1 text-xs text-muted">
                {a.userCount} {t.users} · {a.activeModels} {t.activeModels} ·{" "}
                {a.pendingModels} {t.pendingModels}
                {a.dueDate && ` · ${t.dueBy} ${formatDate(a.dueDate)}`}
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-success">
                {formatCents(a.totalDueCents)}
              </div>
              <div className="text-[11px] text-muted">
                {t.aiSalesPeriod}: {formatCents(a.aiSalesCents)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {a.paymentState === "pending_confirm" && (<form action={confirmAgencyPayment}>
                  <input type="hidden" name="agencyId" value={a.id}/>
                  <Button type="submit" size="sm">
                    {t.confirmPayment}
                  </Button>
                </form>)}
              <form action={suspendAgency}>
                <input type="hidden" name="agencyId" value={a.id}/>
                <input type="hidden" name="suspend" value={a.suspended ? "false" : "true"}/>
                <Button type="submit" size="sm" variant={a.suspended ? "default" : "destructive"}>
                  {a.suspended ? t.activate : t.suspend}
                </Button>
              </form>
              <form action={toggleAgencyPilot}>
                <input type="hidden" name="agencyId" value={a.id}/>
                <input type="hidden" name="enabled" value={a.pilotEnabled ? "false" : "true"}/>
                <Button type="submit" size="sm" variant={a.pilotEnabled ? "destructive" : "secondary"}>
                  {a.pilotEnabled ? t.disablePilot : t.enablePilot}
                </Button>
              </form>
            </div>


            <form action={updatePricing} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <input type="hidden" name="agencyId" value={a.id}/>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted">{t.assistPct}</label>
                <Input name="assistPercent" type="number" min={0} max={100} defaultValue={a.assistPercent} className="h-8 w-20 text-xs"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted">{t.autoPct}</label>
                <Input name="autoPercent" type="number" min={0} max={100} defaultValue={a.autoPercent} className="h-8 w-20 text-xs"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted">{t.modelFee}</label>
                <Input name="perModelFeeDollars" type="number" min={0} step="0.01" defaultValue={(a.perModelFeeCents / 100).toFixed(0)} className="h-8 w-24 text-xs"/>
              </div>
              <Button type="submit" size="sm" variant="secondary">
                {t.save}
              </Button>
            </form>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t.pilotAccounts}
                </div>
                <p className="mt-1 text-xs text-muted">{t.pilotAccountsHelp}</p>
              </div>
              {a.creatorAccounts.map((account) => (<form key={account.id} action={saveCreatorPilotPolicy} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-6 md:items-end">
                  <input type="hidden" name="agencyId" value={a.id}/>
                  <input type="hidden" name="accountId" value={account.id}/>
                  <div className="md:col-span-2">
                    <div className="text-sm font-medium">{account.displayName}</div>
                    <div className="text-xs text-muted">{account.platform}</div>
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] text-muted">
                    {t.pilotMode}
                    <select name="pilotMode" defaultValue={account.pilotMode} className="h-8 rounded-md border border-input bg-surface px-2 text-xs text-foreground">
                      {(["OFF", "SHADOW", "ASSIST", "AUTO"] as const).map((mode) => (<option key={mode} value={mode}>
                            {mode}
                          </option>))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted">
                    {t.dailyAiRuns}
                    <Input name="dailyAiRunLimit" type="number" min={0} max={100000} defaultValue={account.dailyAiRunLimit} className="h-8 text-xs"/>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted">
                    {t.dailyAiBudget}
                    <Input name="dailyAiCostDollars" type="number" min={0} max={1000} step="0.01" defaultValue={(account.dailyAiCostLimitMicros / 1000000).toFixed(2)} className="h-8 text-xs"/>
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input name="complianceApproved" type="checkbox" defaultChecked={account.complianceApprovedAt !== null}/>
                      {t.complianceApproved}
                    </label>
                    <Button type="submit" size="sm" variant="secondary">
                      {t.save}
                    </Button>
                  </div>
                </form>))}
            </div>
          </CardContent>
        </Card>))}
    </div>);
}
