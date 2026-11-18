import Link from "next/link";
import { SearchX } from "lucide-react";
import { getI18n } from "@/i18n";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/page-shell";
export default async function NotFound() {
    const { dict } = await getI18n();
    return (<main className="flex min-h-screen items-center justify-center p-4">
      <EmptyState icon={<SearchX className="h-5 w-5"/>} title={dict.common.notFoundTitle} description={dict.common.notFoundBody} action={<Link href="/inbox" className={buttonVariants()}>
            {dict.common.goToInbox}
          </Link>} className="w-full max-w-xl"/>
    </main>);
}
