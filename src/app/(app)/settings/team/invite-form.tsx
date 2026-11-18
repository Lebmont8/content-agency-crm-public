"use client";
import { useActionState } from "react";
import type { Role } from "@prisma/client";
import { inviteUser } from "./actions";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
export function InviteForm({ actorRole }: {
    actorRole: Role;
}) {
    const { dict } = useI18n();
    const t = dict.settings;
    const [state, action, pending] = useActionState(inviteUser, null);
    const roles: Role[] = actorRole === "OWNER" ? ["CHATTER", "MANAGER", "OWNER"] : ["CHATTER"];
    return (<form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-56 flex-1 flex-col gap-1.5">
        <Label htmlFor="invite-email">{t.email}</Label>
        <Input id="invite-email" name="email" type="email" required/>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role">{t.role}</Label>
        <Select id="invite-role" name="role" defaultValue="CHATTER">
          {roles.map((r) => (<option key={r} value={r}>
              {dict.roles[r]}
            </option>))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t.inviting : t.sendInvite}
      </Button>
      <div className="w-full">
        <FormError error={state?.error}/>
        {state?.inviteUrl && (<div className="mt-2 rounded-md border border-border bg-surface-2 p-3 text-sm">
            <div className="mb-1 text-muted">{t.inviteLinkOneTime}</div>
            <code className="break-all">{state.inviteUrl}</code>
          </div>)}
      </div>
    </form>);
}
