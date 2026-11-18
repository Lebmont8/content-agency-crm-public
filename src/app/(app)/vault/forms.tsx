"use client";
import { useActionState } from "react";
import { createVaultItem } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
export function CreateItemForm({ accountId }: {
    accountId: string;
}) {
    const [state, action, pending] = useActionState(createVaultItem, null);
    return <form action={action} className="flex flex-wrap items-end gap-3"><input type="hidden" name="accountId" value={accountId}/><Label>Title<Input name="title" required minLength={2}/></Label><Label>Type<Select name="mediaType"><option>PHOTO</option><option>VIDEO</option><option>AUDIO</option><option>BUNDLE</option></Select></Label><Label>Price in cents<Input name="priceCents" type="number" min="100" max="1000000" required/></Label><Label>Tags<Input name="tags" placeholder="portrait, video"/></Label><Button disabled={pending} type="submit">Add content</Button><FormError error={state?.error}/></form>;
}
