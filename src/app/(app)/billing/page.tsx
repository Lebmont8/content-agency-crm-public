import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { can } from "@/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/page-shell";
import { getAgencyBilling } from "@/domain/billing-query";
import { formatCents, formatDate } from "@/lib/utils";
import { configuredCryptoRails } from "@/billing/crypto-rails";
import { CryptoPaymentForms } from "./payment-forms";
export default async function BillingPage() {
    const { user, agency } = await requireAuth();
    if (!can(user.role, "billing.manage"))
        redirect("/inbox");
    const { dict } = await getI18n();
    const t = dict.billing;
    const tdb = getTenantDb(user.agencyId);
    const billing = await getAgencyBilling(user.agencyId);
    const inv = billing.invoice;
    const [pendingAccounts, latestPayment, billingHistory] = await Promise.all([
        inv.pendingModels > 0
            ? await tdb.creatorAccount.findMany({
                where: { activated: false },
                select: { id: true, displayName: true, platform: true },
                orderBy: { displayName: "asc" },
            })
            : Promise.resolve([]),
        tdb.cryptoPayment.findFirst({ orderBy: { createdAt: "desc" } }),
        tdb.billingRecord.findMany({ orderBy: { periodEnd: "desc" }, take: 12 }),
    ]);
    const rails = configuredCryptoRails();
    const rows: Array<[
        string,
        string
    ]> = [
        [`${t.fixedFee} (${inv.activeModels} × ${formatCents(inv.perModelFeeCents)})`, formatCents(inv.fixedFeeCents)],
        [`${t.assist} · ${inv.assist.ratePercent}% (${formatCents(inv.assist.salesCents)})`, formatCents(inv.assist.commissionCents)],
        [`${t.auto} · ${inv.auto.ratePercent}% (${formatCents(inv.auto.salesCents)})`, formatCents(inv.auto.commissionCents)],
    ];
    if (inv.activationDueCents > 0) {
        rows.push([t.activationDue, formatCents(inv.activationDueCents)]);
    }
    const totalPayableCents = inv.totalDueCents + inv.activationDueCents;
    return (<div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title={t.title} description={`${t.subtitle} ${agency.name}.`}/>

      {billing.state === "overdue" && (<div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          ⚠ {t.overdueMsg}
          {billing.dueDate && ` (${t.dueBy} ${formatDate(billing.dueDate)})`}
        </div>)}
      {billing.state === "pending_confirm" && (<div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
          ⏳ {t.awaitingConfirm}
        </div>)}
      {billing.state === "blocked" && (<div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {t.aiSuspendedMsg}
        </div>)}

      <Card>
        <CardHeader>
          <CardTitle>{t.dueThisMonth}</CardTitle>
          <CardDescription>{t.commissionDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>{t.title}</TH>
                <TH className="text-right">{t.amount}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(([label, value]) => (<TR key={label}>
                  <TD className="text-muted">{label}</TD>
                  <TD className="text-right">{value}</TD>
                </TR>))}
              <TR>
                <TD className="font-semibold">{t.total}</TD>
                <TD className="text-right text-base font-bold text-success">
                  {formatCents(totalPayableCents)}
                </TD>
              </TR>
            </TBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <CryptoPaymentForms rails={rails.map(({ id, asset, network }) => ({ id, asset, network }))} payment={latestPayment ? {
            id: latestPayment.id,
            asset: latestPayment.asset,
            network: latestPayment.network,
            address: latestPayment.address,
            assetAmount: latestPayment.assetAmount,
            status: latestPayment.status,
            expiresAt: latestPayment.expiresAt.toISOString(),
            txHash: latestPayment.txHash,
        } : null}/>
          </div>
        </CardContent>
      </Card>

      {pendingAccounts.length > 0 && (<Card>
          <CardHeader>
            <CardTitle>{t.pendingActivation}</CardTitle>
            <CardDescription>{t.activationNote}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{t.activeModels}</TH>
                  <TH className="text-right">{t.activationDue}</TH>
                </TR>
              </THead>
              <TBody>
                {pendingAccounts.map((a) => (<TR key={a.id}>
                    <TD className="font-medium">
                      {a.displayName}{" "}
                      <Badge variant="warning">{a.platform}</Badge>
                    </TD>
                    <TD className="text-right">
                      {formatCents(inv.perModelFeeCents)}
                    </TD>
                  </TR>))}
                <TR>
                  <TD className="font-semibold">{t.total}</TD>
                  <TD className="text-right font-bold">
                    {formatCents(inv.activationDueCents)}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </CardContent>
        </Card>)}

      {billingHistory.length > 0 && (<Card>
          <CardHeader><CardTitle>{t.invoiceHistory}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>{t.period}</TH><TH>{t.status}</TH><TH className="text-right">{t.amount}</TH></TR></THead>
              <TBody>
                {billingHistory.map((record) => (<TR key={record.id}>
                    <TD>{formatDate(record.periodStart)} — {formatDate(record.periodEnd)}</TD>
                    <TD><Badge variant={record.status === "PAID" ? "success" : "secondary"}>{record.status}</Badge></TD>
                    <TD className="text-right">{formatCents(record.amountCents)}</TD>
                  </TR>))}
              </TBody>
            </Table>
          </CardContent>
        </Card>)}
    </div>);
}
