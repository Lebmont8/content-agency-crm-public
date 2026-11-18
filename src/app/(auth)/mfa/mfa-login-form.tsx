"use client";
import { useActionState } from "react";
import { completeMfaLogin } from "./actions";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
export function MfaLoginForm() {
    const { dict } = useI18n();
    const [state, action, pending] = useActionState(completeMfaLogin, null);
    return (<form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mfa-code">{dict.mfa.codeOrRecovery}</Label>
        <Input id="mfa-code" name="code" required autoComplete="one-time-code" inputMode="numeric" autoFocus/>
      </div>
      <FormError error={state?.error}/>
      <Button type="submit" disabled={pending}>
        {pending ? dict.mfa.verifying : dict.mfa.verify}
      </Button>
    </form>);
}
