"use client";
import { useActionState } from "react";
import type { ActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import { Label, Select } from "@/components/ui/input";
import { useI18n } from "@/i18n/provider";
import { createTelegramPairing, saveNotificationPreference, type TelegramPairingState } from "./actions";
const EVENTS = [
    "CUSTOM_CONTENT_REQUEST",
    "NEW_LEAD",
    "LARGE_PURCHASE",
    "INTEGRATION_ERROR",
    "AI_ERROR",
    "BILLING_DUE",
    "AI_SUSPENDED",
] as const;
export function NotificationPreferenceForm({ users, accounts, }: {
    users: Array<{
        id: string;
        name: string;
        role: string;
        telegramReady: boolean;
    }>;
    accounts: Array<{
        id: string;
        displayName: string;
    }>;
}) {
    const { dict } = useI18n();
    const t = dict.notifications;
    const [state, action, pending] = useActionState<ActionState, FormData>(saveNotificationPreference, null);
    return (<form action={action} className="grid gap-3 md:grid-cols-3">
      <label className="grid gap-1 text-xs">
        {t.recipient}
        <Select name="userId" required>
          {users.map((user) => (<option key={user.id} value={user.id}>
              {user.name} · {user.role}{user.telegramReady ? " · Telegram ✓" : ""}
            </option>))}
        </Select>
      </label>
      <label className="grid gap-1 text-xs">
        {t.creatorScope}
        <Select name="accountId" defaultValue="*">
          <option value="*">{t.allCreators}</option>
          {accounts.map((account) => (<option key={account.id} value={account.id}>{account.displayName}</option>))}
        </Select>
      </label>
      <label className="grid gap-1 text-xs">
        {t.event}
        <Select name="eventType" defaultValue="CUSTOM_CONTENT_REQUEST">
          {EVENTS.map((event) => (<option key={event} value={event}>{t.eventLabels[event]}</option>))}
        </Select>
      </label>
      <div className="flex flex-wrap items-center gap-4 md:col-span-2">
        <Label className="flex items-center gap-2">
          <input name="inAppEnabled" type="checkbox" defaultChecked/>
          {t.inApp}
        </Label>
        <Label className="flex items-center gap-2">
          <input name="telegramEnabled" type="checkbox"/>
          Telegram
        </Label>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <Button type="submit" size="sm" disabled={pending || users.length === 0}>
          {pending ? dict.common.saving : t.saveRoute}
        </Button>
      </div>
      <div className="md:col-span-3"><FormError error={state?.error}/></div>
    </form>);
}
export function TelegramPairingForm({ botUsername, }: {
    botUsername: string | null;
}) {
    const { dict } = useI18n();
    const t = dict.notifications;
    const [state, action, pending] = useActionState<TelegramPairingState, FormData>(createTelegramPairing, null);
    return (<form action={action} className="grid gap-2">
      <Button type="submit" size="sm" variant="secondary" disabled={pending || !botUsername}>
        {pending ? t.pairing : t.connectTelegram}
      </Button>
      {!botUsername && <p className="text-xs text-warning">{t.telegramNotConfigured}</p>}
      <FormError error={state?.error}/>
      {state?.code && botUsername && (<div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
          <p>{t.pairingInstructions}</p>
          <a className="mt-2 inline-block font-medium text-primary" href={`https://t.me/${botUsername.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
            @{botUsername.replace(/^@/, "")}
          </a>
          <code className="ml-3 rounded bg-surface px-2 py-1">/connect {state.code}</code>
          <p className="mt-2 text-xs text-muted">{t.pairingExpires}</p>
        </div>)}
    </form>);
}
