import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
export function formatCents(cents: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
}
export function formatDate(d: Date | string): string {
    return new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}
export function formatDateTime(d: Date | string): string {
    return new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
export function timeAgo(d: Date | string): string {
    const diff = Date.now() - new Date(d).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1)
        return "now";
    if (min < 60)
        return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24)
        return `${h}h`;
    const days = Math.floor(h / 24);
    if (days < 30)
        return `${days}d`;
    return formatDate(d);
}
