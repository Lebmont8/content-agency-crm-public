import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NotificationPreferenceForm, TelegramPairingForm } from "./forms";
import { deleteNotificationPreference, disconnectTelegramNotifications } from "./actions";
export default async function NotificationSettingsPage() {
    const { user } = await requireAuth();
    const { dict } = await getI18n();
    const t = dict.notifications;
    const tdb = getTenantDb(user.agencyId);
    const [me, users, accounts, preferences] = await Promise.all([
        tdb.user.findUnique({
            where: { id: user.id },
            select: { telegramNotificationVerifiedAt: true },
        }),
        user.role === "OWNER"
            ? tdb.user.findMany({
                where: { isActive: true },
                orderBy: { name: "asc" },
                select: {
                    id: true,
                    name: true,
                    role: true,
                    telegramNotificationVerifiedAt: true,
                },
            })
            : Promise.resolve([]),
        user.role === "OWNER"
            ? tdb.creatorAccount.findMany({
                orderBy: { displayName: "asc" },
                select: { id: true, displayName: true },
            })
            : Promise.resolve([]),
        user.role === "OWNER"
            ? tdb.userNotificationPreference.findMany({
                orderBy: [{ user: { name: "asc" } }, { eventType: "asc" }],
                include: {
                    user: { select: { name: true } },
                    creatorAccount: { select: { displayName: true } },
                },
            })
            : Promise.resolve([]),
    ]);
    return (<div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.telegramTitle}</CardTitle>
          <CardDescription>{t.telegramHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          {me?.telegramNotificationVerifiedAt ? (<div className="flex flex-wrap items-center gap-3">
              <Badge variant="success">Telegram {t.connected}</Badge>
              <form action={disconnectTelegramNotifications}>
                <Button type="submit" size="sm" variant="ghost">{t.disconnect}</Button>
              </form>
            </div>) : (<TelegramPairingForm botUsername={process.env.NOTIFICATION_TELEGRAM_BOT_USERNAME ?? null}/>)}
        </CardContent>
      </Card>

      {user.role === "OWNER" && (<Card>
          <CardHeader>
            <CardTitle>{t.routingTitle}</CardTitle>
            <CardDescription>{t.routingHelp}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <NotificationPreferenceForm users={users.map((row) => ({
                id: row.id,
                name: row.name,
                role: row.role,
                telegramReady: row.telegramNotificationVerifiedAt !== null,
            }))} accounts={accounts}/>
            <div className="grid gap-2 border-t border-border pt-4">
              {preferences.length === 0 && <p className="text-sm text-muted">{t.noRoutes}</p>}
              {preferences.map((preference) => (<div key={preference.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{preference.user.name}</span>
                    <Badge variant="secondary">
                      {t.eventLabels[preference.eventType as keyof typeof t.eventLabels] ?? preference.eventType}
                    </Badge>
                    <span className="text-muted">
                      {preference.creatorAccount?.displayName ?? t.allCreators}
                    </span>
                    {preference.inAppEnabled && <Badge variant="secondary">CRM</Badge>}
                    {preference.telegramEnabled && <Badge variant="secondary">Telegram</Badge>}
                  </div>
                  <form action={deleteNotificationPreference}>
                    <input type="hidden" name="preferenceId" value={preference.id}/>
                    <Button type="submit" size="sm" variant="ghost">{t.deleteRoute}</Button>
                  </form>
                </div>))}
            </div>
          </CardContent>
        </Card>)}
    </div>);
}
