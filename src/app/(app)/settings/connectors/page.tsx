import { requireRole } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BindProfileForm, PairingForm, RevokeDeviceForm } from "./forms";
import { EmptyState } from "@/components/page-shell";
import { PlugZap } from "lucide-react";
export const dynamic = "force-dynamic";
function deviceBadgeVariant(status: string) {
    if (status === "ACTIVE")
        return "success" as const;
    if (status === "REVOKED")
        return "danger" as const;
    return "warning" as const;
}
function profileBadgeVariant(status: string) {
    if (status === "READY")
        return "success" as const;
    if (status === "REVOKED" || status === "ERROR")
        return "danger" as const;
    return "warning" as const;
}
export default async function DesktopConnectorsPage() {
    const { user } = await requireRole("OWNER");
    const { dict, locale } = await getI18n();
    const t = dict.settings;
    const deviceStatusLabel: Record<string, string> = {
        PAIRING: t.connectorStatusPairing,
        ACTIVE: t.connectorStatusActive,
        REVOKED: t.connectorStatusRevoked,
    };
    const profileStatusLabel: Record<string, string> = {
        DRAFT: t.connectorProfileDraft,
        VERIFYING: t.connectorProfileVerifying,
        READY: t.connectorProfileReady,
        REAUTH_REQUIRED: t.connectorProfileReauth,
        REVOKED: t.connectorProfileRevoked,
        ERROR: t.connectorProfileError,
    };
    const tdb = getTenantDb(user.agencyId);
    const [devices, accounts] = await Promise.all([
        tdb.desktopConnectorDevice.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                label: true,
                status: true,
                pairingExpiresAt: true,
                protocolVersion: true,
                appVersion: true,
                pairedAt: true,
                lastSeenAt: true,
                createdAt: true,
                profiles: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        id: true,
                        platform: true,
                        status: true,
                        lastVerifiedAt: true,
                        lastErrorCode: true,
                        creatorAccount: {
                            select: { id: true, displayName: true },
                        },
                    },
                },
            },
        }),
        tdb.creatorAccount.findMany({
            where: { platform: { in: ["onlyfans", "fansly"] } },
            orderBy: { displayName: "asc" },
            select: {
                id: true,
                displayName: true,
                platform: true,
                desktopConnectorProfile: { select: { id: true } },
            },
        }),
    ]);
    const bindableAccounts = accounts
        .filter((account) => !account.desktopConnectorProfile)
        .map(({ id, displayName, platform }) => ({ id, displayName, platform }));
    const dateTime = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "short" });
    const now = Date.now();
    return (<div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.desktopConnectorTitle}</CardTitle>
          <CardDescription>{t.desktopConnectorDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <PairingForm />
        </CardContent>
      </Card>

      <Card className="border-warning/30 bg-warning/5">
        <CardHeader>
          <CardTitle>{t.connectorSafetyTitle}</CardTitle>
          <CardDescription>{t.connectorSafetyDesc}</CardDescription>
        </CardHeader>
      </Card>

      {devices.length === 0 ? (<EmptyState compact icon={<PlugZap className="h-5 w-5"/>} title={t.connectorNoDevices} description={t.desktopConnectorDesc}/>) : (devices.map((device) => {
            const pairingExpired = device.status === "PAIRING" &&
                !!device.pairingExpiresAt &&
                device.pairingExpiresAt.getTime() <= now;
            return (<Card key={device.id}>
              <CardHeader className="flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="break-words">{device.label}</span>
                    <Badge variant={deviceBadgeVariant(device.status)}>
                      {deviceStatusLabel[device.status] ?? device.status}
                    </Badge>
                    {pairingExpired && (<Badge variant="danger">
                        {t.connectorPairingExpired}
                      </Badge>)}
                  </CardTitle>
                  <CardDescription className="mt-1 break-all">
                    {t.connectorDeviceId}: <code>{device.id}</code>
                  </CardDescription>
                </div>
                {device.status !== "REVOKED" && (<RevokeDeviceForm deviceId={device.id}/>)}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
                  <span>
                    {t.connectorCreated}: {dateTime.format(device.createdAt)}
                  </span>
                  <span>
                    {t.connectorLastSeen}:{" "}
                    {device.lastSeenAt
                    ? dateTime.format(device.lastSeenAt)
                    : t.connectorNever}
                  </span>
                  <span>
                    {t.connectorAppVersion}: {device.appVersion ?? "—"}
                  </span>
                  <span>
                    {t.connectorProtocol}: {device.protocolVersion ?? "—"}
                  </span>
                </div>

                {device.status === "PAIRING" && (<p className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
                    {pairingExpired
                        ? t.connectorExpiredCodeUnavailable
                        : t.connectorCodeUnavailable}
                  </p>)}

                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                    {t.connectorProfiles}
                  </div>
                  {device.profiles.length === 0 ? (<p className="text-xs text-muted">
                      {t.connectorNoProfiles}
                    </p>) : (<div className="flex flex-col gap-2">
                      {device.profiles.map((profile) => (<div key={profile.id} className="rounded-md border border-border bg-surface-2 p-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium">
                              {profile.creatorAccount.displayName}
                            </span>
                            <Badge variant="secondary">{profile.platform}</Badge>
                            <Badge variant={profileBadgeVariant(profile.status)}>
                              {profileStatusLabel[profile.status] ?? profile.status}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted">
                            {profile.lastVerifiedAt
                            ? `${t.connectorLastVerified}: ${dateTime.format(profile.lastVerifiedAt)}`
                            : t.connectorNotVerified}
                            {profile.lastErrorCode
                            ? ` · ${t.connectionErrorCode}: ${profile.lastErrorCode}`
                            : ""}
                          </div>
                        </div>))}
                    </div>)}
                </div>

                {device.status === "ACTIVE" && (<BindProfileForm deviceId={device.id} accounts={bindableAccounts}/>)}
              </CardContent>
            </Card>);
        }))}
    </div>);
}
