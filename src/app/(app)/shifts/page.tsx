import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { can } from "@/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/page-shell";
import { endShift, startShift } from "./actions";
import { formatCents, formatDateTime } from "@/lib/utils";
function duration(start: Date, end: Date | null): string {
    const ms = (end ? end.getTime() : Date.now()) - start.getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m.toString().padStart(2, "0")}m`;
}
export default async function ShiftsPage() {
    const { user } = await requireAuth();
    const { dict } = await getI18n();
    const t = dict.shifts;
    const tdb = getTenantDb(user.agencyId);
    const seesAll = can(user.role, "kpi.viewAll");
    const [active, shifts] = await Promise.all([
        tdb.shift.findFirst({ where: { userId: user.id, endedAt: null } }),
        tdb.shift.findMany({
            where: seesAll ? {} : { userId: user.id },
            orderBy: { startedAt: "desc" },
            take: 40,
            include: { user: { select: { name: true } } },
        }),
    ]);
    return (<div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title={t.title} description={t.subtitle}/>
      <Card>
        <CardHeader className="flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t.myShift}</CardTitle>
            <CardDescription className="mt-1">
              {active
            ? `${t.activeSince} ${formatDateTime(active.startedAt)} (${duration(active.startedAt, null)}). ${t.activeShiftDesc}`
            : t.noActiveShift}
            </CardDescription>
          </div>
          {active ? (<form action={endShift}>
              <Button variant="destructive" type="submit">
                {t.endShift}
              </Button>
            </form>) : (<form action={startShift}>
              <Button type="submit">{t.startShift}</Button>
            </form>)}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{seesAll ? t.allShifts : t.myShifts}</CardTitle>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (<p className="text-xs text-muted">{t.noShifts}</p>) : (<Table>
              <THead>
                <TR>
                  {seesAll && <TH>{t.chatter}</TH>}
                  <TH>{t.started}</TH>
                  <TH>{t.duration}</TH>
                  <TH className="text-right">{t.revenue}</TH>
                  <TH className="text-right">{t.ppvSent}</TH>
                  <TH className="text-right">{t.ppvClosed}</TH>
                  <TH className="text-right">{t.conversion}</TH>
                </TR>
              </THead>
              <TBody>
                {shifts.map((s) => (<TR key={s.id}>
                    {seesAll && <TD className="font-medium">{s.user.name}</TD>}
                    <TD className="text-muted">{formatDateTime(s.startedAt)}</TD>
                    <TD>
                      {s.endedAt ? (duration(s.startedAt, s.endedAt)) : (<Badge variant="success">{t.active}</Badge>)}
                    </TD>
                    <TD className="text-right font-medium text-success">
                      {formatCents(s.revenueCents)}
                    </TD>
                    <TD className="text-right">{s.ppvSentCount}</TD>
                    <TD className="text-right">{s.ppvClosedCount}</TD>
                    <TD className="text-right text-muted">
                      {s.ppvSentCount > 0
                    ? `${Math.round((s.ppvClosedCount / s.ppvSentCount) * 100)}%`
                    : "—"}
                    </TD>
                  </TR>))}
              </TBody>
            </Table>)}
        </CardContent>
      </Card>
    </div>);
}
