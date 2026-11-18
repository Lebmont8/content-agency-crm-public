"use client";
import { useActionState, useEffect, useState } from "react";
import { sendMessage, sendPpv } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
type Item = {
    id: string;
    title: string;
    defaultPriceCents: number;
    mediaType: string;
};
export function Composer({ conversationId, vaultItems, canSendText, canSendPpv }: {
    conversationId: string;
    vaultItems: Item[];
    canSendText: boolean;
    canSendPpv: boolean;
}) {
    const [text, sendText, textBusy] = useActionState(sendMessage, null);
    const [ppv, sendPaid, paidBusy] = useActionState(sendPpv, null);
    const [requestId, setRequestId] = useState("");
    const [paidId, setPaidId] = useState("");
    const [item, setItem] = useState(vaultItems[0]?.id ?? "");
    useEffect(() => { setRequestId(crypto.randomUUID()); setPaidId(crypto.randomUUID()); }, []);
    const selected = vaultItems.find(i => i.id === item);
    return <div className="space-y-4">{canSendText && <form action={sendText} className="space-y-2"><input type="hidden" name="conversationId" value={conversationId}/><input type="hidden" name="clientRequestId" value={requestId}/><input type="hidden" name="aiMode" value="NONE"/><Textarea name="body" required maxLength={4000} aria-label="Message"/><Button disabled={textBusy || !requestId}>Send message</Button><FormError error={text?.error}/></form>}{canSendPpv && vaultItems.length > 0 && <form action={sendPaid} className="space-y-2"><input type="hidden" name="conversationId" value={conversationId}/><input type="hidden" name="clientRequestId" value={paidId}/><input type="hidden" name="aiMode" value="NONE"/><Select name="vaultItemId" value={item} onChange={e => setItem(e.target.value)}>{vaultItems.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</Select><Input readOnly name="priceCents" type="number" value={selected?.defaultPriceCents ?? 0} aria-label="Price in cents"/><Textarea name="caption" aria-label="Caption"/><Button disabled={paidBusy || !paidId}>Send selected content</Button><FormError error={ppv?.error}/></form>}</div>;
}
