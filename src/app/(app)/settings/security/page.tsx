import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { requiresMfa } from "@/auth/mfa";
import { currentTrustedDeviceId } from "@/auth/trusted-device";
import { getI18n } from "@/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { beginMfaSetup, regenerateRecoveryCodes, replaceAuthenticator, revokeAllRememberedDevices, revokeRememberedDevice } from "./actions";
import { SecurityForm } from "./security-form";
export default async function SecurityPage() {
    const { user } = await requireAuth();
    const tdb = getTenantDb(user.agencyId);
    const mfaRequired = requiresMfa(user);
    const now = new Date();
    const [credential, devices, currentDeviceId] = await Promise.all([
        tdb.userMfaCredential.findFirst({
            where: { userId: user.id },
            select: { enabledAt: true },
        }),
        tdb.trustedDevice.findMany({
            where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
            orderBy: { lastUsedAt: "desc" },
            select: {
                id: true,
                label: true,
                lastUsedAt: true,
                expiresAt: true,
            },
        }),
        currentTrustedDeviceId(user.id),
    ]);
    const { dict } = await getI18n();
    return (<div className="flex flex-col gap-6">
      {!credential?.enabledAt && (<Card>
          <CardHeader>
            <CardTitle>{dict.mfa.security}</CardTitle>
            <CardDescription>
              {mfaRequired ? dict.mfa.required : dict.mfa.optional}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={beginMfaSetup}>
              <Button type="submit">{dict.mfa.enable}</Button>
            </form>
          </CardContent>
        </Card>)}

      {credential?.enabledAt && (<>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {dict.mfa.security}{" "}
                <Badge variant="success">{dict.mfa.enabled}</Badge>
              </CardTitle>
              <CardDescription>
                {mfaRequired ? dict.mfa.required : dict.mfa.enabledDesc}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{dict.mfa.regenerateTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <SecurityForm action={regenerateRecoveryCodes} submitLabel={dict.mfa.regenerate}/>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{dict.mfa.replaceTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <SecurityForm action={replaceAuthenticator} submitLabel={dict.mfa.replace}/>
            </CardContent>
          </Card>
        </>)}

      <Card>
        <CardHeader>
          <CardTitle>{dict.mfa.trustedDevicesTitle}</CardTitle>
          <CardDescription>{dict.mfa.trustedDevicesDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {devices.length === 0 ? (<p className="text-sm text-muted">{dict.mfa.noTrustedDevices}</p>) : (devices.map((device) => (<div key={device.id} className="flex flex-col items-stretch justify-between gap-4 rounded-xl border border-border bg-surface-2/45 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="truncate">{device.label}</span>
                    {device.id === currentDeviceId && (<Badge variant="secondary">
                        {dict.mfa.currentDevice}
                      </Badge>)}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {dict.mfa.lastUsed}: {device.lastUsedAt.toLocaleString()} ·{" "}
                    {dict.mfa.expires}: {device.expiresAt.toLocaleDateString()}
                  </div>
                </div>
                <form action={revokeRememberedDevice}>
                  <input type="hidden" name="deviceId" value={device.id}/>
                  <Button type="submit" variant="destructive" size="sm">
                    {dict.mfa.revokeDevice}
                  </Button>
                </form>
              </div>)))}
          {devices.length > 0 && (<form action={revokeAllRememberedDevices}>
              <Button type="submit" variant="destructive">
                {dict.mfa.revokeAllDevices}
              </Button>
            </form>)}
        </CardContent>
      </Card>
    </div>);
}
