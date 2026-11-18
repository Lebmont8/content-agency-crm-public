import { db } from "@/lib/db";
import { getI18n } from "@/i18n";
import { AcceptInviteForm } from "./accept-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { hashOpaqueToken } from "@/lib/auth-token";
export default async function InvitePage({ params, }: {
    params: Promise<{
        token: string;
    }>;
}) {
    const { token } = await params;
    const { dict } = await getI18n();
    const t = dict.auth;
    const invite = await db.invitation.findUnique({
        where: { tokenHash: hashOpaqueToken(token) },
        include: { agency: { select: { name: true } } },
    });
    const invalid = !invite || !!invite.acceptedAt || invite.expiresAt < new Date();
    if (invalid) {
        return (<Card>
        <CardHeader>
          <CardTitle className="text-xl">{t.inviteNotFoundTitle}</CardTitle>
          <CardDescription>{t.inviteNotFoundDesc}</CardDescription>
        </CardHeader>
      </Card>);
    }
    return (<Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {t.joinTitle} {invite.agency.name}
        </CardTitle>
        <CardDescription>
          {t.invitedAs} <b>{dict.roles[invite.role]}</b> ({invite.email}).{" "}
          {t.setNamePassword}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInviteForm token={token}/>
      </CardContent>
    </Card>);
}
