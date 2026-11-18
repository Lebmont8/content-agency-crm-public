"use client";
import { useEffect, useTransition } from "react";
import { restoreTrustedLogin } from "../actions";
export function AutoRestoreTrustedLogin() {
    const [, startTransition] = useTransition();
    useEffect(() => {
        startTransition(async () => {
            await restoreTrustedLogin();
        });
    }, []);
    return null;
}
