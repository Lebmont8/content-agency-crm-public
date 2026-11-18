import { redirect } from "next/navigation";
import { getMfaChallenge } from "@/auth/mfa-challenge";
import { getI18n } from "@/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MfaLoginForm } from "./mfa-login-form";
export default async function MfaPage() {
    const challenge = await getMfaChallenge();
    if (!challenge || challenge.purpose !== "LOGIN")
        redirect("/login");
    const { dict } = await getI18n();
    return (<Card>
      <CardHeader>
        <CardTitle className="text-xl">{dict.mfa.loginTitle}</CardTitle>
        <CardDescription>{dict.mfa.loginDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        {challenge.rememberDevice && (<p className="mb-3 text-sm text-muted">
            {dict.mfa.deviceWillBeRemembered}
          </p>)}
        <MfaLoginForm />
      </CardContent>
    </Card>);
}
