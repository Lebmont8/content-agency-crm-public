"use client";
import Link from "next/link";
import { useActionState } from "react";
import { completeMfaSetup } from "../actions";
import { useI18n } from "@/i18n/provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
export function MfaSetupForm() {
    const { dict } = useI18n();
    const [state, action, pending] = useActionState(completeMfaSetup, null);
    if (state?.recoveryCodes) {
        return (<div className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">{dict.mfa.recoveryTitle}</h2>
          <p className="mt-1 text-sm text-muted">{dict.mfa.recoveryDesc}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-2 p-3 font-mono text-sm">
          {state.recoveryCodes.map((code) => <div key={code}>{code}</div>)}
        </div>
        <Link href={state.continueUrl ?? "/"} className={buttonVariants()}>
          {dict.mfa.continue}
        </Link>
      </div>);
    }
    return (<form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setup-code">{dict.mfa.authenticatorCode}</Label>
        <Input id="setup-code" name="code" required minLength={6} maxLength={6} inputMode="numeric" autoComplete="one-time-code"/>
      </div>
      <FormError error={state?.error}/>
      <Button type="submit" disabled={pending}>
        {pending ? dict.mfa.verifying : dict.mfa.enable}
      </Button>
    </form>);
}
