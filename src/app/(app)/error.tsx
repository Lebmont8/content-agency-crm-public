"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/page-shell";
export default function AppError({ error, reset, }: {
    error: Error & {
        digest?: string;
    };
    reset: () => void;
}) {
    const { dict } = useI18n();
    useEffect(() => {
        console.error(error);
    }, [error]);
    return (<EmptyState icon={<AlertTriangle className="h-5 w-5"/>} title={dict.common.errorTitle} description={dict.common.errorBody} action={<Button onClick={reset}>{dict.common.tryAgain}</Button>} className="mx-auto max-w-2xl"/>);
}
