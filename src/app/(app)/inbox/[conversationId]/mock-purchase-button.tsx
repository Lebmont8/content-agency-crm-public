"use client";
import { useActionState } from "react";
import { simulateMockPurchase } from "../actions";
import type { ActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import { useI18n } from "@/i18n/provider";
export function MockPurchaseButton({ vaultSendId }: {
    vaultSendId: string;
}) {
    const { dict } = useI18n();
    const [state, action, pending] = useActionState(simulateMockPurchase, null as ActionState);
    return (<form action={action} className="mt-1.5 border-t border-border/60 pt-1.5" data-testid={`mock-purchase-${vaultSendId}`}>
      <input type="hidden" name="vaultSendId" value={vaultSendId}/>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? dict.inbox.simulatingPurchase : dict.inbox.simulatePurchase}
      </Button>
      <FormError error={state?.error}/>
    </form>);
}
