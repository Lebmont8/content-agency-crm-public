import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-4", {
    variants: {
        variant: {
            default: "bg-primary/15 text-primary border border-primary/30",
            secondary: "bg-surface-2 text-muted border border-border",
            success: "bg-success/10 text-success border border-success/30",
            warning: "bg-warning/10 text-warning border border-warning/30",
            danger: "bg-danger/10 text-danger border border-danger/30",
            whale: "bg-whale/10 text-whale border border-whale/30",
        },
    },
    defaultVariants: { variant: "default" },
});
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
}
export function Badge({ className, variant, ...props }: BadgeProps) {
    return <span className={cn(badgeVariants({ variant }), className)} {...props}/>;
}
