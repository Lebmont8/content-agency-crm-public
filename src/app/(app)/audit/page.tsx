import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { can } from "@/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/page-shell";
import { cn, formatDateTime } from "@/lib/utils";
const DAY_OPTIONS = [1, 7, 30];
function actionLabel(action: string, labels: Record<string, string>): string {
    const prefix = action.split(".")[0] ?? "";
    return labels[prefix] ?? labels.other ?? action;
}
export default async function AuditPage({ searchParams, }: {
    searchParams: Promise<{
        actor?: string;
        action?: string;
        days?: string;
    }>;
}) {
    const { user } = await requireAuth();
    if (!can(user.role, "audit.view"))
        redirect("/inbox");
    const { dict } = await getI18n();
    const t = dict.audit;
    const ACTION_GROUPS = [
        { key: "", label: t.groupAll },
        { key: "message.", label: t.groupMessages },
        { key: "ppv.", label: t.groupPpv },
        { key: "fan.", label: t.groupFans },
        { key: "vault.", label: t.groupVault },
        { key: "assignment.", label: t.groupAssignments },
        { key: "auth.", label: t.groupAuth },
        { key: "user.", label: t.groupUsers },
        { key: "shift.", label: t.groupShifts },
    ];
    const params = await searchParams;
    const days = DAY_OPTIONS.includes(Number(params.days)) ? Number(params.days) : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const tdb = getTenantDb(user.agencyId);
    const [users, logs] = await Promise.all([
        tdb.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        tdb.auditLog.findMany({
            where: {
                createdAt: { gte: since },
                ...(params.actor ? { actorId: params.actor } : {}),
                ...(params.action ? { action: { startsWith: params.action } } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 200,
        }),
    ]);
    const actorNames = new Map(users.map((listedUser) => [listedUser.id, listedUser.name]));
    const actionLabels: Record<string, string> = {
        auth: t.actionAuth,
        user: t.actionUser,
        message: t.actionMessage,
        ppv: t.actionPpv,
        fan: t.actionFan,
        vault: t.actionVault,
        assignment: t.actionAssignment,
        shift: t.actionShift,
        billing: t.actionBilling,
        notification: t.actionNotification,
        sales: t.actionAiSettings,
        account: t.actionAccount,
        platform: t.actionConnection,
        connector: t.actionConnection,
        conversation: t.actionConversation,
        "content-request": t.actionContentRequest,
        agency: t.actionAgency,
        other: t.actionOther,
    };
    const href = (patch: Record<string, string | undefined>) => {
        const p = new URLSearchParams();
        const merged = { actor: params.actor, action: params.action, days: String(days), ...patch };
        for (const [k, v] of Object.entries(merged))
            if (v)
                p.set(k, v);
        return `/audit?${p.toString()}`;
    };
    return (<div className="mx-auto flex max-w-5xl flex-col gap-3">
      <PageHeader title={t.title} description={t.subtitle}/>

      <div className="mt-2 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/60 p-3">
        <div className="flex flex-wrap gap-1">
          {ACTION_GROUPS.map((g) => (<Link key={g.key} href={href({ action: g.key || undefined })} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", (params.action ?? "") === g.key
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted hover:text-foreground")}>
              {g.label}
            </Link>))}
        </div>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((d) => (<Link key={d} href={href({ days: String(d) })} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", days === d
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted hover:text-foreground")}>
              {d}d
            </Link>))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Link href={href({ actor: undefined })} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", !params.actor
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border text-muted hover:text-foreground")}>
            {t.anyone}
          </Link>
          {users.map((u) => (<Link key={u.id} href={href({ actor: u.id })} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", params.actor === u.id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted hover:text-foreground")}>
              {u.name}
            </Link>))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>{t.when}</TH>
                <TH>{t.actor}</TH>
                <TH>{t.action}</TH>
              </TR>
            </THead>
            <TBody>
              {logs.length === 0 && (<TR>
                  <TD colSpan={3} className="py-6 text-center text-muted">
                    {t.empty}
                  </TD>
                </TR>)}
              {logs.map((log) => (<TR key={log.id}>
                  <TD className="whitespace-nowrap text-muted">
                    {formatDateTime(log.createdAt)}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {(log.actorId && actorNames.get(log.actorId)) ?? t.system}
                  </TD>
                  <TD>
                    <Badge variant={log.action.startsWith("ppv") || log.action.startsWith("vault")
                ? "default"
                : "secondary"}>
                      {actionLabel(log.action, actionLabels)}
                    </Badge>
                  </TD>
                </TR>))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>);
}
