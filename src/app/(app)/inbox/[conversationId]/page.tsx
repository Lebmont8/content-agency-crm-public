import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { assertAccountAccess } from "@/domain/access";
import { can, PermissionError } from "@/auth/permissions";
import { ConversationList } from "../conversation-list";
import { Composer } from "./composer";
import { Badge } from "@/components/ui/badge";
import { cn, formatCents, formatDateTime, timeAgo } from "@/lib/utils";
import { getPlatformCapabilities } from "@/platform/registry";
import { HandoffControls } from "./handoff-controls";
import { MockPurchaseButton } from "./mock-purchase-button";
import { isMockPurchaseEnabled } from "@/platform/mock/purchase";
import { ContentRequestControls } from "./content-request-controls";
export default async function ConversationPage({ params, }: {
    params: Promise<{
        conversationId: string;
    }>;
}) {
    const auth = await requireAuth();
    const { conversationId } = await params;
    const { dict } = await getI18n();
    const t = dict.inbox;
    const tdb = getTenantDb(auth.user.agencyId);
    const convo = await tdb.conversation.findUnique({
        where: { id: conversationId },
        include: {
            fan: true,
            assignedUser: { select: { id: true, name: true } },
            creatorAccount: { include: { connection: true } },
        },
    });
    if (!convo)
        notFound();
    try {
        await assertAccountAccess(tdb, auth.user, convo.creatorAccountId);
    }
    catch (e) {
        if (e instanceof PermissionError)
            notFound();
        throw e;
    }
    if (convo.unreadCount > 0) {
        await tdb.conversation.update({
            where: { id: convo.id },
            data: { unreadCount: 0 },
        });
    }
    await tdb.internalNotification.updateMany({
        where: {
            conversationId: convo.id,
            recipientUserId: auth.user.id,
            readAt: null,
        },
        data: { readAt: new Date() },
    });
    const [messages, vaultItems, notes, tagLinks, purchases, sends, shadowRuns, contentRequests, requestAssignees,] = await Promise.all([
        tdb.message.findMany({
            where: { conversationId },
            orderBy: { sentAt: "desc" },
            take: 100,
            include: {
                sentBy: { select: { name: true } },
                originAgentAction: {
                    select: {
                        id: true,
                        kind: true,
                        status: true,
                        agentRun: {
                            select: {
                                id: true,
                                status: true,
                                inboundEvent: {
                                    select: { id: true, providerEventId: true },
                                },
                            },
                        },
                    },
                },
                vaultSend: {
                    include: {
                        vaultItem: { select: { title: true } },
                        transaction: {
                            select: { id: true, amountCents: true, occurredAt: true },
                        },
                    },
                },
                outboundDelivery: { select: { id: true, status: true } },
            },
        }),
        tdb.vaultItem.findMany({
            where: { creatorAccountId: convo.creatorAccountId },
            orderBy: { title: "asc" },
            select: { id: true, title: true, defaultPriceCents: true, mediaType: true },
        }),
        tdb.fanNote.findMany({
            where: { fanId: convo.fanId },
            orderBy: { createdAt: "desc" },
            take: 3,
            include: { author: { select: { name: true } } },
        }),
        tdb.fanTagLink.findMany({
            where: { fanId: convo.fanId },
            include: { tag: true },
        }),
        tdb.transaction.findMany({
            where: { fanId: convo.fanId },
            orderBy: { occurredAt: "desc" },
            take: 5,
        }),
        tdb.vaultSend.findMany({
            where: { fanId: convo.fanId },
            orderBy: { sentAt: "desc" },
            take: 6,
            include: { vaultItem: { select: { title: true } } },
        }),
        tdb.agentRun.findMany({
            where: { conversationId, shadowOnly: true },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
                id: true,
                status: true,
                errorCode: true,
                copilotModel: true,
                llmInputTokens: true,
                llmOutputTokens: true,
                reservedCostMicros: true,
                decision: true,
                createdAt: true,
            },
        }),
        tdb.contentRequest.findMany({
            where: { conversationId },
            orderBy: { requestedAt: "desc" },
            take: 20,
            include: { assignedUser: { select: { name: true } } },
        }),
        can(auth.user.role, "assignments.manage")
            ? tdb.user.findMany({
                where: {
                    isActive: true,
                    OR: [
                        { role: "OWNER" },
                        { assignments: { some: { creatorAccountId: convo.creatorAccountId } } },
                    ],
                },
                orderBy: { name: "asc" },
                select: { id: true, name: true },
            })
            : Promise.resolve([]),
    ]);
    const ordered = [...messages].reverse();
    const capabilities = getPlatformCapabilities(convo.creatorAccount.platform, convo.creatorAccount.connection?.status, convo.creatorAccount.connection?.capabilities);
    const mockPurchaseEnabled = convo.creatorAccount.platform === "mock" && isMockPurchaseEnabled();
    return (<>
      <ConversationList auth={auth} filters={{}} activeId={convo.id}/>


      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border/80 bg-surface/35 px-3 py-2.5 backdrop-blur-sm sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/inbox" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground md:hidden">
              <ArrowLeft className="h-4 w-4"/>
              <span className="sr-only">{dict.nav.inbox}</span>
            </Link>
            <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {convo.fan.displayName}{" "}
              <span className="font-normal text-muted">@{convo.fan.username}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Badge variant="secondary">{convo.creatorAccount.displayName}</Badge>
              {tagLinks.map((link) => (<Badge key={link.id} variant="secondary">#{link.tag.name}</Badge>))}
            </div>
            </div>
          </div>
          <Link href={`/fans/${convo.fanId}`} className="ml-2 shrink-0 rounded-lg px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/10">
            {t.openFanCard}
          </Link>
        </div>

        <HandoffControls conversationId={convo.id} status={convo.handoffStatus} reason={convo.handoffReason} requestedAt={convo.handoffRequestedAt?.toISOString() ?? null} slaDueAt={convo.handoffSlaDueAt?.toISOString() ?? null} assignedUserName={convo.assignedUser?.name ?? null} canResume={convo.assignedUserId === auth.user.id ||
            can(auth.user.role, "assignments.manage")} autoEnabled={convo.creatorAccount.aiAutoReply}/>

        <ContentRequestControls conversationId={convo.id} requests={contentRequests.map((request) => ({
            id: request.id,
            summary: request.summary,
            status: request.status,
            assignedUserId: request.assignedUserId,
            assignedUserName: request.assignedUser?.name ?? null,
        }))} assignees={requestAssignees} currentUserId={auth.user.id} canAssign={can(auth.user.role, "assignments.manage")}/>

        {shadowRuns.length > 0 && (<div className="border-b border-border bg-surface-2/60 px-4 py-2" data-testid="shadow-evaluation-trace">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{t.shadowTitle}</span>
              <span className="text-[10px] text-muted">{t.shadowNoSend}</span>
            </div>
            <div className="mt-1 flex flex-col gap-1">
              {shadowRuns.map((run) => {
                const summary = shadowDecisionSummary(run.decision);
                return (<div key={run.id} className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted">
                    <Badge variant={run.status === "COMPLETED" ? "success" : "secondary"}>
                      {run.status.toLowerCase()}
                    </Badge>
                    <span>{shortId(run.id)}</span>
                    <span>{run.copilotModel ?? "—"}</span>
                    <span>
                      {(run.llmInputTokens ?? 0) + (run.llmOutputTokens ?? 0)} {t.shadowTokens}
                    </span>
                    <span>
                      {t.shadowReserved} ${((run.reservedCostMicros ?? 0) / 1000000).toFixed(3)}
                    </span>
                    {summary && (<span>
                        {summary.reason} · {summary.proposals} {t.shadowProposals}
                      </span>)}
                    {run.errorCode && <span>{run.errorCode}</span>}
                    <span>{formatDateTime(run.createdAt)}</span>
                  </div>);
            })}
            </div>
          </div>)}

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-gradient-to-b from-transparent to-surface/20 p-3 sm:p-4">
          {ordered.map((m) => (<div key={m.id} className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[75%]", m.direction === "OUT"
                ? "self-end rounded-br-md border border-primary/20 bg-primary/18"
                : "self-start rounded-bl-md border border-border bg-surface-2")}>
              {m.ppvPriceCents != null && (<div className="mb-1 flex items-center gap-2 text-xs">
                  <Badge>🔒 PPV {formatCents(m.ppvPriceCents)}</Badge>
                  {m.vaultSend && (<>
                      <span className="text-muted">{m.vaultSend.vaultItem.title}</span>
                      {m.vaultSend.purchasedAt ? (<Badge variant="success">{t.purchased}</Badge>) : (<Badge variant="secondary">{t.notPurchased}</Badge>)}
                    </>)}
                </div>)}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <div className="mt-1 text-right text-[10px] text-muted">
                {m.direction === "OUT" && m.sentBy ? `${m.sentBy.name} · ` : ""}
                {formatDateTime(m.sentAt)}
              </div>
              {m.outboundDelivery && m.outboundDelivery.status !== "SENT" && (<div className="mt-1 text-right text-[10px] text-muted">
                  {deliveryStatusLabel(m.outboundDelivery.status, t)}
                </div>)}
              {m.originAgentAction && (<div className="mt-1.5 border-t border-border/60 pt-1.5 text-[10px] text-muted" data-testid={`agent-trace-${m.originAgentAction.id}`} data-delivery-status={m.outboundDelivery?.status.toLowerCase() ?? "none"} data-purchase-status={!m.vaultSend
                    ? "none"
                    : m.vaultSend.transaction
                        ? "purchased"
                        : "pending"}>
                  <span>{t.traceRun} {shortId(m.originAgentAction.agentRun.id)}</span>
                  <span> → {t.traceAction} {shortId(m.originAgentAction.id)}</span>
                  {m.outboundDelivery && (<span>
                      {" "}→ {t.traceDelivery} {m.outboundDelivery.status.toLowerCase()}
                    </span>)}
                  {m.vaultSend?.transaction ? (<span className="text-success">
                      {" "}→ {t.tracePurchase} {formatCents(m.vaultSend.transaction.amountCents)}
                    </span>) : m.vaultSend ? (<span> → {t.traceAwaitingPurchase}</span>) : null}
                </div>)}
              {mockPurchaseEnabled &&
                m.originAgentAction &&
                m.outboundDelivery?.status === "SENT" &&
                m.vaultSend &&
                !m.vaultSend.purchasedAt && (<MockPurchaseButton vaultSendId={m.vaultSend.id}/>)}
            </div>))}
        </div>

        <Composer conversationId={convo.id} vaultItems={vaultItems} canSendText={capabilities.canSendText} canSendPpv={capabilities.canSendPpv}/>
      </div>


      <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border/80 bg-surface/25 p-4 xl:flex">
        <div>
          <div className="text-sm font-semibold">{convo.fan.displayName}</div>
          <div className="text-xs text-muted">@{convo.fan.username}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-success">
              {formatCents(convo.fan.totalSpentCents)}
            </span>
            <span className="text-xs text-muted">{dict.common.lifetime}</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            {t.subscribedAgo} {timeAgo(convo.fan.subscribedAt)} {t.ago} · {t.activeAgo}{" "}
            {timeAgo(convo.fan.lastActiveAt)} {t.ago}
          </div>
        </div>

        {tagLinks.length > 0 && (<div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.tags}
            </h4>
            <div className="flex flex-wrap gap-1">
              {tagLinks.map((l) => (<Badge key={l.id} variant="secondary">
                  #{l.tag.name}
                </Badge>))}
            </div>
          </div>)}

        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t.notes}
          </h4>
          {notes.length === 0 && <p className="text-xs text-muted">{t.noNotes}</p>}
          <div className="flex flex-col gap-2">
            {notes.map((n) => (<div key={n.id} className="rounded-md border border-border bg-surface-2 p-2">
                <p className="text-xs">{n.body}</p>
                <p className="mt-1 text-[10px] text-muted">
                  {n.author.name} · {formatDateTime(n.createdAt)}
                </p>
              </div>))}
          </div>
        </div>

        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t.recentPurchases}
          </h4>
          {purchases.length === 0 && (<p className="text-xs text-muted">{t.nothingYet}</p>)}
          <div className="flex flex-col gap-1">
            {purchases.map((t) => (<div key={t.id} className="flex items-center justify-between text-xs">
                <span className="text-muted">
                  {t.type.toLowerCase()} · {formatDateTime(t.occurredAt)}
                </span>
                <span className="font-medium text-success">
                  {formatCents(t.amountCents)}
                </span>
              </div>))}
          </div>
        </div>

        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t.vaultHistory}
          </h4>
          {sends.length === 0 && (<p className="text-xs text-muted">{t.nothingSent}</p>)}
          <div className="flex flex-col gap-1">
            {sends.map((s) => (<div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-muted">{s.vaultItem.title}</span>
                {s.purchasedAt ? (<Badge variant="success">{t.bought} {formatCents(s.priceCents)}</Badge>) : (<Badge variant="secondary">{t.sent} {formatCents(s.priceCents)}</Badge>)}
              </div>))}
          </div>
        </div>
      </aside>
    </>);
}
function shortId(id: string): string {
    return id.slice(0, 8);
}
function shadowDecisionSummary(decision: unknown): {
    reason: string;
    proposals: number;
} | null {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
        return null;
    }
    const reason = (decision as {
        reason?: unknown;
    }).reason;
    const proposedActions = (decision as {
        proposedActions?: unknown;
    }).proposedActions;
    if (typeof reason !== "string" || !Array.isArray(proposedActions))
        return null;
    return { reason, proposals: proposedActions.length };
}
function deliveryStatusLabel(status: string, t: {
    deliveryPending: string;
    deliveryConfirming: string;
    deliveryFailed: string;
}): string {
    if (status === "CONFIRMING")
        return t.deliveryConfirming;
    if (["FAILED", "DLQ", "CANCELED"].includes(status))
        return t.deliveryFailed;
    return t.deliveryPending;
}
