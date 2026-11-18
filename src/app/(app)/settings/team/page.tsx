import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { can } from "@/auth/permissions";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { InviteForm } from "./invite-form";
import { deactivateUser, revokeInvite } from "./actions";
import { formatDate } from "@/lib/utils";
export default async function TeamPage() {
    const { user } = await requireAuth();
    if (!can(user.role, "users.manage"))
        redirect("/settings/accounts");
    const { dict } = await getI18n();
    const t = dict.settings;
    const tdb = getTenantDb(user.agencyId);
    const [users, invites] = await Promise.all([
        tdb.user.findMany({ orderBy: { createdAt: "asc" } }),
        tdb.invitation.findMany({
            where: { acceptedAt: null, expiresAt: { gt: new Date() } },
            select: { id: true, email: true, role: true, expiresAt: true },
            orderBy: { createdAt: "desc" },
        }),
    ]);
    return (<div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.teamMembers}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>{t.name}</TH>
                <TH>{t.email}</TH>
                <TH>{t.role}</TH>
                <TH>{t.status}</TH>
                <TH>{t.joined}</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {users.map((u) => (<TR key={u.id}>
                  <TD className="font-medium">{u.name}</TD>
                  <TD className="text-muted">{u.email}</TD>
                  <TD>
                    <Badge variant={u.role === "OWNER" ? "default" : "secondary"}>
                      {dict.roles[u.role]}
                    </Badge>
                  </TD>
                  <TD>
                    {u.isActive ? (<Badge variant="success">{t.active}</Badge>) : (<Badge variant="danger">{t.deactivated}</Badge>)}
                  </TD>
                  <TD className="text-muted">{formatDate(u.createdAt)}</TD>
                  <TD className="text-right">
                    {u.id !== user.id && u.isActive && u.role !== "OWNER" && (<form action={deactivateUser}>
                        <input type="hidden" name="userId" value={u.id}/>
                        <Button variant="destructive" size="sm" type="submit">
                          {t.deactivate}
                        </Button>
                      </form>)}
                  </TD>
                </TR>))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.inviteUser}</CardTitle>
          <CardDescription>
            {user.role === "MANAGER" ? t.managerInviteNote : t.ownerInviteNote}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm actorRole={user.role}/>
        </CardContent>
      </Card>

      {invites.length > 0 && (<Card>
          <CardHeader>
            <CardTitle>{t.pendingInvites}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{t.email}</TH>
                  <TH>{t.role}</TH>
                  <TH>{t.expires}</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {invites.map((inv) => (<TR key={inv.id}>
                    <TD>{inv.email}</TD>
                    <TD>
                      <Badge variant="secondary">{dict.roles[inv.role]}</Badge>
                    </TD>
                    <TD className="text-muted">{formatDate(inv.expiresAt)}</TD>
                    <TD className="text-right">
                      <form action={revokeInvite}>
                        <input type="hidden" name="inviteId" value={inv.id}/>
                        <Button variant="ghost" size="sm" type="submit">
                          {dict.common.revoke}
                        </Button>
                      </form>
                    </TD>
                  </TR>))}
              </TBody>
            </Table>
          </CardContent>
        </Card>)}
    </div>);
}
