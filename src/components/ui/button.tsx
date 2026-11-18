import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva("inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50", {
    variants: {
        variant: {
            default: "border border-primary/70 bg-gradient-to-b from-primary to-primary-hover text-primary-foreground shadow-[0_7px_20px_rgba(124,58,237,0.2)] hover:-translate-y-px hover:brightness-110",
            secondary: "border border-border bg-surface-2 text-foreground shadow-sm hover:border-border-strong hover:bg-surface-3",
            ghost: "text-foreground hover:bg-white/[0.05]",
            destructive: "border border-danger/30 bg-danger/12 text-danger hover:bg-danger/20",
            outline: "border border-border bg-transparent text-foreground hover:border-border-strong hover:bg-white/[0.035]",
        },
        size: {
            default: "h-10 px-4 py-2",
            sm: "h-8 px-3 text-xs",
            lg: "h-11 px-6",
            icon: "h-10 w-10",
        },
    },
    defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
}
export function Button({ className, variant, size, ...props }: ButtonProps) {
    return (<button className={cn(buttonVariants({ variant, size }), className)} {...props}/>);
}
export { buttonVariants };
