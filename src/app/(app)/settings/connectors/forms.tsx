"use client";
import { useActionState } from "react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
import { bindConnectorProfile, issueConnectorPairing, revokeConnectorDevice } from "./actions";
type BindableAccount = {
    id: string;
    displayName: string;
    platform: string;
};
export function PairingForm() {
    const { dict, locale } = useI18n();
    const t = dict.settings;
    const [state, action, pending] = useActionState(issueConnectorPairing, null);
    return (<form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="connector-device-label">{t.connectorDeviceLabel}</Label>
          <Input id="connector-device-label" name="label" maxLength={80} required defaultValue="Vexora Desktop" placeholder={t.connectorDeviceLabelPlaceholder}/>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? t.connectorCreatingPairing : t.connectorCreatePairing}
        </Button>
      </div>
      <FormError error={state?.errorCode
            ? `${t.connectorActionFailed}: ${state.errorCode}`
            : undefined}/>
      {state?.pairing && (<div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <p className="text-sm font-medium">{t.connectorPairingCodeOneTime}</p>
          <code className="mt-2 block break-all rounded bg-surface px-3 py-2 text-sm">
            {state.pairing.pairingCode}
          </code>
          <p className="mt-2 text-xs text-muted">
            {t.connectorDeviceId}:{" "}
            <code className="break-all">{state.pairing.deviceId}</code>
            {" · "}
            {t.connectorPairingExpires}:{" "}
            {new Date(state.pairing.expiresAt).toLocaleString(locale)}
          </p>
        </div>)}
    </form>);
}
export function BindProfileForm({ deviceId, accounts, }: {
    deviceId: string;
    accounts: BindableAccount[];
}) {
    const { dict } = useI18n();
    const t = dict.settings;
    const [state, action, pending] = useActionState(bindConnectorProfile, null);
    if (accounts.length === 0) {
        return <p className="text-xs text-muted">{t.connectorNoBindableAccounts}</p>;
    }
    return (<form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="deviceId" value={deviceId}/>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor={`connector-account-${deviceId}`}>
            {t.connectorBindAccount}
          </Label>
          <Select id={`connector-account-${deviceId}`} name="creatorAccountId" required>
            {accounts.map((account) => (<option key={account.id} value={account.id}>
                {account.displayName} · {account.platform}
              </option>))}
          </Select>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t.connectorBinding : t.connectorBind}
        </Button>
      </div>
      <FormError error={state?.errorCode
            ? `${t.connectorActionFailed}: ${state.errorCode}`
            : undefined}/>
      {state?.result && (<p className="text-xs text-success">
          {state.result === "BOUND"
                ? t.connectorBound
                : t.connectorAlreadyBound}
        </p>)}
    </form>);
}
export function RevokeDeviceForm({ deviceId }: {
    deviceId: string;
}) {
    const { dict } = useI18n();
    const t = dict.settings;
    const [state, action, pending] = useActionState(revokeConnectorDevice, null);
    return (<form action={action} className="flex flex-col items-end gap-2" onSubmit={(event) => {
            if (!window.confirm(t.connectorConfirmRevoke)) {
                event.preventDefault();
            }
        }}>
      <input type="hidden" name="deviceId" value={deviceId}/>
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? t.connectorRevoking : t.connectorRevoke}
      </Button>
      <FormError error={state?.errorCode
            ? `${t.connectorActionFailed}: ${state.errorCode}`
            : undefined}/>
      {state?.result && (<p className="text-xs text-success">{t.connectorRevoked}</p>)}
    </form>);
}
