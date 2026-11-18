"use client";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
const ROOT_SCREENS = new Set(["/inbox", "/onboarding"]);
export function NavigationBack({ label }: {
    label: string;
}) {
    const pathname = usePathname();
    const router = useRouter();
    if (ROOT_SCREENS.has(pathname))
        return null;
    return (<Button type="button" variant="ghost" size="sm" className="mb-4 -ml-2 text-muted" onClick={() => {
            if (window.history.length > 1)
                router.back();
            else
                router.push("/inbox");
        }}>
      <ArrowLeft className="h-4 w-4"/>
      {label}
    </Button>);
}
