"use client";
import { useActionState } from "react";
import type { SecurityActionState } from "./actions";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
export function SecurityForm({ action, submitLabel, }: {
    action: (state: SecurityActionState, formData: FormData) => Promise<SecurityActionState>;
    submitLabel: string;
}) {
    const { dict } = useI18n();
    const [state, formAction, pending] = useActionState(action, null);
    return (<form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${submitLabel}-password`}>{dict.mfa.password}</Label>
        <Input id={`${submitLabel}-password`} name="password" type="password" autoComplete="current-password" required/>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${submitLabel}-factor`}>{dict.mfa.currentFactor}</Label>
        <Input id={`${submitLabel}-factor`} name="factor" autoComplete="one-time-code" required/>
      </div>
      <FormError error={state?.error}/>
      {state?.recoveryCodes && (<div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-2 p-3 font-mono text-sm">
          {state.recoveryCodes.map((code) => <div key={code}>{code}</div>)}
        </div>)}
      <Button type="submit" disabled={pending}>{submitLabel}</Button>
    </form>);
}
