"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function LivePoller({ intervalSeconds }: {
    intervalSeconds: number;
}) {
    const router = useRouter();
    useEffect(() => {
        const id = setInterval(async () => {
            try {
                const res = await fetch("/api/mock/tick", { method: "POST" });
                if (!res.ok)
                    return;
                const data = (await res.json()) as {
                    created?: boolean;
                };
                if (data.created)
                    router.refresh();
            }
            catch {
            }
        }, intervalSeconds * 1000);
        return () => clearInterval(id);
    }, [intervalSeconds, router]);
    return null;
}
