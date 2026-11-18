import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { getI18n } from "@/i18n";
import { assertAccountAccess } from "@/domain/access";
import { PermissionError } from "@/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/page-shell";
import { NoteForm, TagForm } from "./forms";
import { deleteNote, removeTag } from "./actions";
import { formatCents, formatDate, formatDateTime, timeAgo } from "@/lib/utils";
export default async function FanPage({ params, }: {
    params: Promise<{
        fanId: string;
    }>;
}) {
    const auth = await requireAuth();
    const { fanId } = await params;
    const { dict } = await getI18n();
    const t = dict.fans;
    const tdb = getTenantDb(auth.user.agencyId);
    const fan = await tdb.fan.findUnique({
        where: { id: fanId },
        include: { creatorAccount: true },
    });
    if (!fan)
        notFound();
    try {
        await assertAccountAccess(tdb, auth.user, fan.creatorAccountId);
    }
    catch (e) {
        if (e instanceof PermissionError)
            notFound();
        throw e;
    }
    const [transactions, notes, tagLinks, sends, conversation] = await Promise.all([
        tdb.transaction.findMany({
            where: { fanId },
            orderBy: { occurredAt: "desc" },
            take: 50,
            include: { closedBy: { select: { name: true } } },
        }),
        tdb.fanNote.findMany({
            where: { fanId },
            orderBy: { createdAt: "desc" },
            include: { author: { select: { name: true } } },
        }),
        tdb.fanTagLink.findMany({ where: { fanId }, include: { tag: true } }),
        tdb.vaultSend.findMany({
            where: { fanId },
            orderBy: { sentAt: "desc" },
            take: 30,
            include: {
                vaultItem: { select: { title: true } },
                sentBy: { select: { name: true } },
            },
        }),
        tdb.conversation.findFirst({
            where: { fanId, creatorAccountId: fan.creatorAccountId },
            select: { id: true },
        }),
    ]);
    return (<div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader title={<>
            {fan.displayName}{" "}
            <span className="text-base font-normal tracking-normal text-muted">
              @{fan.username}
            </span>
          </>} description={<span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{fan.creatorAccount.displayName}</Badge>
            <Badge variant={fan.subscriptionStatus === "ACTIVE" ? "success" : "danger"}>
              {fan.subscriptionStatus === "ACTIVE"
                ? dict.settings.active
                : dict.segments.expired}
            </Badge>
            <span className="w-full pt-0.5 text-xs text-muted">
            {t.subscribed} {formatDate(fan.subscribedAt)} · {t.lastActive}{" "}
            {timeAgo(fan.lastActiveAt)} {dict.inbox.ago}
            </span>
          </span>} actions={<div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-bold text-success">
              {formatCents(fan.totalSpentCents)}
            </div>
            <div className="text-xs text-muted">{dict.common.lifetimeSpend}</div>
          </div>
          {conversation && (<Link href={`/inbox/${conversation.id}`}>
              <Button variant="secondary">{t.openChat}</Button>
            </Link>)}
        </div>}/>

      <div className="grid gap-4 lg:grid-cols-2">

        <Card>
          <CardHeader>
            <CardTitle>{t.purchaseTimeline}</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (<p className="text-xs text-muted">{t.noPurchases}</p>) : (<Table>
                <THead>
                  <TR>
                    <TH>{t.when}</TH>
                    <TH>{t.type}</TH>
                    <TH>{t.closedBy}</TH>
                    <TH className="text-right">{t.amount}</TH>
                  </TR>
                </THead>
                <TBody>
                  {transactions.map((t) => (<TR key={t.id}>
                      <TD className="text-muted">{formatDateTime(t.occurredAt)}</TD>
                      <TD>
                        <Badge variant={t.type === "PPV"
                    ? "default"
                    : t.type === "TIP"
                        ? "warning"
                        : "secondary"}>
                          {t.type.toLowerCase()}
                        </Badge>
                      </TD>
                      <TD className="text-muted">{t.closedBy?.name ?? "—"}</TD>
                      <TD className="text-right font-medium text-success">
                        {formatCents(t.amountCents)}
                      </TD>
                    </TR>))}
                </TBody>
              </Table>)}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">

          <Card>
            <CardHeader>
              <CardTitle>{dict.inbox.tags}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {tagLinks.length === 0 && (<p className="text-xs text-muted">{t.noTags}</p>)}
                {tagLinks.map((l) => (<form action={removeTag} key={l.id} className="inline-flex">
                    <input type="hidden" name="linkId" value={l.id}/>
                    <button type="submit" title={dict.common.remove} className="inline-flex cursor-pointer items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-foreground hover:border-danger/50 hover:text-danger">
                      #{l.tag.name} ×
                    </button>
                  </form>))}
              </div>
              <TagForm fanId={fan.id}/>
            </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle>{dict.inbox.notes}</CardTitle>
            </CardHeader>
            <CardContent>
              <NoteForm fanId={fan.id}/>
              <div className="mt-3 flex flex-col gap-2">
                {notes.map((n) => (<div key={n.id} className="rounded-xl border border-border bg-surface-2/70 p-3">
                    <p className="text-sm">{n.body}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-muted">
                        {n.author.name} · {formatDateTime(n.createdAt)}
                      </span>
                      <form action={deleteNote}>
                        <input type="hidden" name="noteId" value={n.id}/>
                        <button type="submit" className="cursor-pointer text-[11px] text-muted hover:text-danger">
                          {dict.common.delete}
                        </button>
                      </form>
                    </div>
                  </div>))}
              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle>{t.contentSent}</CardTitle>
            </CardHeader>
            <CardContent>
              {sends.length === 0 ? (<p className="text-xs text-muted">{dict.inbox.nothingSent}</p>) : (<div className="flex flex-col gap-1.5">
                  {sends.map((s) => (<div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        {s.vaultItem.title}
                        <span className="ml-1 text-muted">
                          {s.sentBy ? `${t.by} ${s.sentBy.name}` : ""} ·{" "}
                          {formatDate(s.sentAt)}
                        </span>
                      </span>
                      {s.purchasedAt ? (<Badge variant="success">{dict.inbox.bought} {formatCents(s.priceCents)}</Badge>) : (<Badge variant="secondary">{dict.inbox.sent} {formatCents(s.priceCents)}</Badge>)}
                    </div>))}
                </div>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>);
}
