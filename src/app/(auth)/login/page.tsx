"use client";
import { useActionState } from "react";
import { login } from "../actions";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/form-error";
import { AutoRestoreTrustedLogin } from "./auto-restore";
export default function LoginPage() {
    const { dict } = useI18n();
    const t = dict.auth;
    const [state, action, pending] = useActionState(login, null);
    return (<Card>
      <AutoRestoreTrustedLogin />
      <CardHeader>
        <CardTitle className="text-xl">{t.signInTitle}</CardTitle>
        <CardDescription>{t.signInDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t.email}</Label>
            <Input id="email" name="email" type="email" required autoComplete="email"/>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="rememberDevice" className="h-4 w-4 rounded border-border accent-primary"/>
            {t.rememberDevice}
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t.password}</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password"/>
          </div>
          <FormError error={state?.error}/>
          <Button type="submit" disabled={pending}>
            {pending ? t.signingIn : dict.common.signIn}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          {t.registrationByInvitation}
        </p>
      </CardContent>
    </Card>);
}
