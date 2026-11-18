"use client";
import { useActionState } from "react";
import type { ActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/provider";
import { createCryptoPayment, submitCryptoPayment } from "./actions";
type Rail = {
    id: string;
    asset: string;
    network: string;
};
type Payment = {
    id: string;
    asset: string;
    network: string;
    address: string;
    assetAmount: string;
    status: string;
    expiresAt: string;
    txHash: string | null;
} | null;
export function CryptoPaymentForms({ rails, payment }: {
    rails: Rail[];
    payment: Payment;
}) {
    const { dict } = useI18n();
    const t = dict.billing;
    const [createState, createAction, creating] = useActionState<ActionState, FormData>(createCryptoPayment, null);
    const [submitState, submitAction, submitting] = useActionState<ActionState, FormData>(submitCryptoPayment, null);
    if (rails.length === 0) {
        return <p className="text-sm text-warning">{t.noCryptoRails}</p>;
    }
    const active = payment && ["CREATED", "SUBMITTED", "VERIFYING"].includes(payment.status);
    return (<div className="grid gap-4">
      {!active && (<form action={createAction} className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-64 gap-1 text-xs">
            {t.cryptoOption}
            <Select name="railId" defaultValue={rails[0]?.id}>
              {rails.map((rail) => (<option key={rail.id} value={rail.id}>{rail.asset} · {rail.network}</option>))}
            </Select>
          </label>
          <Button type="submit" disabled={creating}>{creating ? "…" : t.createPayment}</Button>
          <FormError error={createState?.error}/>
        </form>)}
      {active && payment && (<div className="grid gap-3 rounded-xl border border-border bg-surface-2/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{payment.assetAmount} {payment.asset}</strong>
            <Badge variant={payment.status === "CREATED" ? "warning" : "secondary"}>
              {payment.status === "CREATED" ? t.awaitingTransfer : t.awaitingConfirm}
            </Badge>
          </div>
          <div className="text-xs text-muted">{t.network}: {payment.network}</div>
          <code className="break-all rounded-lg bg-background px-3 py-2 text-xs">{payment.address}</code>
          <p className="text-xs text-muted">{t.paymentExpires}: {new Date(payment.expiresAt).toLocaleString()}</p>
          {payment.status === "CREATED" && (<form action={submitAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="paymentId" value={payment.id}/>
              <div className="min-w-64 flex-1">
                <Label htmlFor={`tx-${payment.id}`}>{t.txHash}</Label>
                <Input id={`tx-${payment.id}`} name="txHash" required minLength={16} maxLength={200} className="mt-1"/>
              </div>
              <Button type="submit" disabled={submitting}>{submitting ? "…" : t.submitTransaction}</Button>
              <FormError error={submitState?.error}/>
            </form>)}
          {payment.txHash && <div className="break-all text-xs text-muted">TX: {payment.txHash}</div>}
        </div>)}
    </div>);
}
