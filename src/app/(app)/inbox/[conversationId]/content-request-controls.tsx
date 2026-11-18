"use client";
import { useActionState } from "react";
import type { ActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/form-error";
import { useI18n } from "@/i18n/provider";
import { createContentRequest, updateContentRequest } from "../actions";
type RequestRow = {
    id: string;
    summary: string;
    status: string;
    assignedUserId: string | null;
    assignedUserName: string | null;
};
export function ContentRequestControls({ conversationId, requests, assignees, currentUserId, canAssign, }: {
    conversationId: string;
    requests: RequestRow[];
    assignees: Array<{
        id: string;
        name: string;
    }>;
    currentUserId: string;
    canAssign: boolean;
}) {
    const { dict } = useI18n();
    const t = dict.inbox;
    const [state, action, pending] = useActionState<ActionState, FormData>(createContentRequest, null);
    return (<details className="border-b border-border bg-warning/[0.05] px-4 py-2.5" open={requests.some((row) => row.status !== "COMPLETED") || undefined}>
      <summary className="cursor-pointer text-xs font-semibold text-warning">
        {t.customContentRequests} · {requests.filter((row) => row.status !== "COMPLETED").length}
      </summary>
      <div className="mt-2 grid gap-2">
        {requests.map((request) => (<div key={request.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{request.summary}</span>
              <Badge variant={request.status === "COMPLETED" ? "success" : "warning"}>
                {request.status === "NEW"
                ? t.requestNew
                : request.status === "IN_PROGRESS"
                    ? t.requestInProgress
                    : t.requestCompleted}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-muted">{t.requestResponsible}: {request.assignedUserName ?? t.handoffUnassigned}</span>
              {request.status === "NEW" && (<form action={updateContentRequest}>
                  <input type="hidden" name="requestId" value={request.id}/>
                  <Button type="submit" name="intent" value="claim" size="sm" variant="secondary">
                    {t.requestClaim}
                  </Button>
                </form>)}
              {request.status === "IN_PROGRESS" &&
                (request.assignedUserId === currentUserId || canAssign) && (<form action={updateContentRequest}>
                    <input type="hidden" name="requestId" value={request.id}/>
                    <Button type="submit" name="intent" value="complete" size="sm" variant="secondary">
                      {t.requestComplete}
                    </Button>
                  </form>)}
              {request.status === "COMPLETED" && canAssign && (<form action={updateContentRequest}>
                  <input type="hidden" name="requestId" value={request.id}/>
                  <Button type="submit" name="intent" value="reopen" size="sm" variant="ghost">
                    {t.requestReopen}
                  </Button>
                </form>)}
              {canAssign && assignees.length > 0 && request.status !== "COMPLETED" && (<form action={updateContentRequest} className="flex items-center gap-1">
                  <input type="hidden" name="requestId" value={request.id}/>
                  <Select name="assignedUserId" defaultValue={request.assignedUserId ?? assignees[0]?.id} className="h-8 text-xs">
                    {assignees.map((assignee) => (<option key={assignee.id} value={assignee.id}>{assignee.name}</option>))}
                  </Select>
                  <Button type="submit" name="intent" value="assign" size="sm" variant="ghost">
                    {t.requestAssign}
                  </Button>
                </form>)}
            </div>
          </div>))}
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="conversationId" value={conversationId}/>
          <Input name="summary" required minLength={3} maxLength={500} placeholder={t.customContentPlaceholder} className="min-w-56 flex-1"/>
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {t.addCustomContentRequest}
          </Button>
          <FormError error={state?.error}/>
        </form>
      </div>
    </details>);
}
