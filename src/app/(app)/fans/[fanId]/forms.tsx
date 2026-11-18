"use client";
import { useRef, useActionState } from "react";
import { addNote, addTag } from "./actions";
import type { ActionState } from "@/app/(auth)/actions";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
export function NoteForm({ fanId }: {
    fanId: string;
}) {
    const { dict } = useI18n();
    const ref = useRef<HTMLFormElement>(null);
    const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
        const res = await addNote(prev, fd);
        if (!res)
            ref.current?.reset();
        return res;
    }, null);
    return (<form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="fanId" value={fanId}/>
      <Textarea name="body" rows={2} required placeholder={dict.fans.notePlaceholder}/>
      <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
        <FormError error={state?.error}/>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? dict.common.saving : dict.fans.addNote}
        </Button>
      </div>
    </form>);
}
export function TagForm({ fanId }: {
    fanId: string;
}) {
    const { dict } = useI18n();
    const ref = useRef<HTMLFormElement>(null);
    const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
        const res = await addTag(prev, fd);
        if (!res)
            ref.current?.reset();
        return res;
    }, null);
    return (<form ref={ref} action={action} className="flex items-center gap-2">
      <input type="hidden" name="fanId" value={fanId}/>
      <Input name="name" placeholder={dict.fans.addTag} required className="h-9 max-w-48 text-xs"/>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        +
      </Button>
      <FormError error={state?.error}/>
    </form>);
}
