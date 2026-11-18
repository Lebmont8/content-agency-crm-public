"use client";
import Link from "next/link";
import { useActionState } from "react";
import { register } from "../actions";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/form-error";
export function RegisterPageContent({ enabled }: {
    enabled: boolean;
}) {
    const { dict } = useI18n();
    const t = dict.auth;
    const [state, action, pending] = useActionState(register, null);
    if (!enabled) {
        return (<Card>
        <CardHeader>
          <CardTitle className="text-xl">{t.registrationClosedTitle}</CardTitle>
          <CardDescription>{t.registrationClosedDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="text-sm text-primary hover:underline">
            {dict.common.signIn}
          </Link>
        </CardContent>
      </Card>);
    }
    return (<Card>
      <CardHeader>
        <CardTitle className="text-xl">{t.createAgencyTitle}</CardTitle>
        <CardDescription>{t.createAgencyDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agencyName">{t.agencyName}</Label>
            <Input id="agencyName" name="agencyName" required minLength={2}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">{t.yourName}</Label>
            <Input id="name" name="name" required minLength={2}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t.email}</Label>
            <Input id="email" name="email" type="email" required autoComplete="email"/>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t.passwordMin}</Label>
            <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password"/>
          </div>
          <FormError error={state?.error}/>
          <Button type="submit" disabled={pending}>
            {pending ? t.creating : t.createAgency}
          </Button>
          <p className="text-xs leading-relaxed text-muted">
            {t.mfaLaterNote}
          </p>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          {t.haveAccount}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {dict.common.signIn}
          </Link>
        </p>
      </CardContent>
    </Card>);
}
