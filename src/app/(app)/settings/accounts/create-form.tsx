"use client";
import { useActionState } from "react";
import { createAccount } from "./actions";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
export function CreateAccountForm() {
    const { dict } = useI18n();
    const t = dict.settings;
    const [state, action, pending] = useActionState(createAccount, null);
    return (<form action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <Label htmlFor="acc-name">{t.displayName}</Label>
        <Input id="acc-name" name="displayName" required placeholder={t.displayNamePlaceholder}/>
      </div>
      <div className="flex min-w-56 flex-col gap-1.5">
        <Label htmlFor="acc-platform">{t.platform}</Label>
        <Select id="acc-platform" name="platform" defaultValue="fanvue" className="w-full">
          <option value="fanvue">{t.platformFanvue}</option>
          <option value="onlyfans">{t.platformOnlyFans}</option>
          <option value="fansly">{t.platformFansly}</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending} className="w-full xl:w-auto">
        {pending ? t.connecting : t.connect}
      </Button>
      <div className="md:col-span-3">
        <FormError error={state?.error}/>
      </div>
    </form>);
}
