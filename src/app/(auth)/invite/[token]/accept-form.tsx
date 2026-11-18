"use client";
import { useActionState } from "react";
import { acceptInvite } from "../../actions";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
export function AcceptInviteForm({ token }: {
    token: string;
}) {
    const { dict } = useI18n();
    const t = dict.auth;
    const [state, action, pending] = useActionState(acceptInvite, null);
    return (<form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token}/>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t.yourName}</Label>
        <Input id="name" name="name" required minLength={2}/>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t.passwordMin}</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password"/>
      </div>
      <FormError error={state?.error}/>
      <Button type="submit" disabled={pending}>
        {pending ? t.joining : t.joinAgency}
      </Button>
    </form>);
}
