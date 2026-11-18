import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (<input className={cn("flex h-10 w-full rounded-[10px] border border-border bg-surface-2/80 px-3 py-1 text-sm text-foreground shadow-inner shadow-black/5 placeholder:text-muted/80 transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50", className)} {...props}/>);
}
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
    return (<textarea ref={ref} className={cn("flex min-h-[82px] w-full resize-y rounded-[10px] border border-border bg-surface-2/80 px-3 py-2 text-sm text-foreground shadow-inner shadow-black/5 placeholder:text-muted/80 transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50", className)} {...props}/>);
});
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (<select className={cn("flex h-10 rounded-[10px] border border-border bg-surface-2/80 px-3 py-1 text-sm text-foreground transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50", className)} {...props}/>);
}
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
    return (<label className={cn("text-xs font-medium text-foreground/85", className)} {...props}/>);
}
