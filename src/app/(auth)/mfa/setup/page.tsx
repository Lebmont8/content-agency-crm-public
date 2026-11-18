import QRCode from "qrcode";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getMfaChallenge } from "@/auth/mfa-challenge";
import { mfaSetupUri, readCredentialSecret } from "@/auth/mfa";
import { getI18n } from "@/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MfaSetupForm } from "./setup-form";
export default async function MfaSetupPage() {
    const challenge = await getMfaChallenge();
    if (!challenge || challenge.purpose !== "SETUP")
        redirect("/login");
    const credential = challenge.user.mfaCredential;
    if (!credential || credential.enabledAt)
        redirect("/login");
    const { dict } = await getI18n();
    const secret = readCredentialSecret(credential);
    const uri = mfaSetupUri(challenge.user.email, secret);
    const qr = await QRCode.toDataURL(uri, { width: 240, margin: 1 });
    return (<Card>
      <CardHeader>
        <CardTitle className="text-xl">{dict.mfa.setupTitle}</CardTitle>
        <CardDescription>{dict.mfa.setupDesc}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {challenge.rememberDevice && (<p className="text-sm text-muted">
            {dict.mfa.deviceWillBeRemembered}
          </p>)}
        <Image src={qr} alt={dict.mfa.qrAlt} width={240} height={240} unoptimized className="mx-auto h-60 w-60 rounded bg-white"/>
        <div>
          <div className="text-xs text-muted">{dict.mfa.manualSecret}</div>
          <code className="mt-1 block break-all rounded bg-surface-2 p-2 text-xs">
            {secret}
          </code>
        </div>
        <MfaSetupForm />
      </CardContent>
    </Card>);
}
