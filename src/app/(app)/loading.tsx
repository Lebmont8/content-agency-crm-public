import { Skeleton } from "@/components/page-shell";
export default function AppLoading() {
    return (<div className="mx-auto flex max-w-5xl flex-col gap-5" aria-busy="true">
      <div>
        <Skeleton className="h-8 w-48"/>
        <Skeleton className="mt-3 h-4 w-80 max-w-full"/>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (<Skeleton key={index} className="h-28 rounded-2xl"/>))}
      </div>
      <Skeleton className="h-80 rounded-2xl"/>
    </div>);
}
