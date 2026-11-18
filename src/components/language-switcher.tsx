"use client";
import { useTransition } from "react";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
export function LanguageSwitcher({ className }: {
    className?: string;
}) {
    const { locale } = useI18n();
    const [pending, startTransition] = useTransition();
    return (<div className={cn("inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-surface-2/80 p-0.5", className)}>
      {LOCALES.map((l) => (<button key={l} type="button" disabled={pending} onClick={() => startTransition(() => setLocale(l))} className={cn("min-h-7 cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50", locale === l
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-muted hover:text-foreground")} aria-pressed={locale === l}>
          {LOCALE_LABELS[l]}
        </button>))}
    </div>);
}
