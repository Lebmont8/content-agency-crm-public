import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
export function BrandMark({ className }: {
    className?: string;
}) {
    return (<span className={cn("relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-primary via-violet-500 to-fuchsia-500 text-white shadow-[0_10px_30px_rgba(124,58,237,0.3)]", className)} aria-hidden="true">
      <span className="absolute inset-px rounded-[10px] bg-gradient-to-br from-white/20 to-transparent"/>
      <Sparkles className="relative h-4 w-4" strokeWidth={2.2}/>
    </span>);
}
export function BrandLockup({ name, subtitle, compact = false, className, }: {
    name: string;
    subtitle?: string;
    compact?: boolean;
    className?: string;
}) {
    return (<div className={cn("flex min-w-0 items-center gap-3", className)}>
      <BrandMark className={compact ? "h-8 w-8 rounded-[10px]" : undefined}/>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          {name}
        </div>
        {subtitle && (<div className="mt-0.5 truncate text-[11px] text-muted">{subtitle}</div>)}
      </div>
    </div>);
}
