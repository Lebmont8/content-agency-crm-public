"use client";
import { useActionState } from "react";
import { updateHandoff } from "../actions";
import type { ActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
import { useI18n } from "@/i18n/provider";
import { formatDateTime, timeAgo } from "@/lib/utils";
export function HandoffControls({ conversationId, status, reason, requestedAt, slaDueAt, assignedUserName, canResume, autoEnabled, }: {
    conversationId: string;
    status: "REQUESTED" | "TAKEN_OVER" | null;
    reason: string | null;
    requestedAt: string | null;
    slaDueAt: string | null;
    assignedUserName: string | null;
    canResume: boolean;
    autoEnabled: boolean;
}) {
    const { dict } = useI18n();
    const t = dict.inbox;
    const [state, action, pending] = useActionState(updateHandoff, null as ActionState);
    const overdue = slaDueAt ? new Date(slaDueAt).getTime() < Date.now() : false;
    return (<div className="border-b border-border bg-surface-2/50 px-4 py-2.5">
      {status && (<div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={overdue ? "font-medium text-danger" : "font-medium text-warning"}>
            {status === "REQUESTED" ? t.handoffRequested : t.handoffTakenOver}
          </span>
          <span className="text-muted">{reason}</span>
          <span className="text-muted">
            {t.handoffOwner}: {assignedUserName ?? t.handoffUnassigned}
          </span>
          {requestedAt && (<span className="text-muted">
              {t.handoffAge}: {timeAgo(new Date(requestedAt))}
            </span>)}
          {slaDueAt && (<span className={overdue ? "text-danger" : "text-muted"}>
              {overdue ? t.handoffSlaBreached : t.handoffSla}: {formatDateTime(slaDueAt)}
            </span>)}
        </div>)}

      {!(status === "TAKEN_OVER" && !canResume) && (<form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="conversationId" value={conversationId}/>
          <Input name="reason" required minLength={3} maxLength={500} placeholder={status === "TAKEN_OVER" ? t.resumeReason : t.handoffReason} className="min-w-56 flex-1"/>
          {status === "TAKEN_OVER" ? (<>
              <Select name="mode" defaultValue="ASSIST" className="w-36">
                <option value="ASSIST">{t.resumeAssist}</option>
                {autoEnabled && <option value="AUTO">{t.resumeAuto}</option>}
              </Select>
              <Button name="intent" value="resume" disabled={pending}>
                {t.resumeAi}
              </Button>
            </>) : status === "REQUESTED" ? (<Button name="intent" value="takeover" disabled={pending}>
              {t.takeOver}
            </Button>) : (<>
              <Button name="intent" value="takeover" disabled={pending}>
                {t.takeOver}
              </Button>
              <Button name="intent" value="request" variant="secondary" disabled={pending}>
                {t.requestHandoff}
              </Button>
            </>)}
        </form>)}
      <FormError error={state?.error}/>
    </div>);
}
