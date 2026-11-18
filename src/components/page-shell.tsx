import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
export function PageHeader({ eyebrow, title, description, actions, className, }: {
    eyebrow?: string;
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (<header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && (<p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>)}
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-[28px]">
          {title}
        </h1>
        {description && (<p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            {description}
          </p>)}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>);
}
export function EmptyState({ icon, title, description, action, compact = false, className, }: {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    compact?: boolean;
    className?: string;
}) {
    return (<div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/45 text-center", compact ? "px-4 py-8" : "min-h-64 px-6 py-12", className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-primary shadow-sm">
        {icon ?? <Inbox className="h-5 w-5" strokeWidth={1.8}/>}
      </div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && (<p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
          {description}
        </p>)}
      {action && <div className="mt-4">{action}</div>}
    </div>);
}
export function Skeleton({ className, }: {
    className?: string;
}) {
    return (<div className={cn("animate-pulse rounded-lg bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%]", className)} aria-hidden="true"/>);
}
