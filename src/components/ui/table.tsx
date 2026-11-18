import * as React from "react";
import { cn } from "@/lib/utils";
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
    return (<div className="w-full overflow-x-auto overscroll-x-contain">
      <table className={cn("w-full min-w-max caption-bottom text-sm", className)} {...props}/>
    </div>);
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <thead className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props}/>;
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props}/>;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
    return (<tr className={cn("border-b border-border transition-colors hover:bg-surface-2/60", className)} {...props}/>);
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
    return (<th className={cn("h-10 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.08em] text-muted", className)} {...props}/>);
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return <td className={cn("px-3 py-2.5 align-middle", className)} {...props}/>;
}
