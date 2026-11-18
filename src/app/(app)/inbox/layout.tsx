import { LivePoller } from "./live-poller";
export default function InboxLayout({ children }: {
    children: React.ReactNode;
}) {
    const liveEnabled = process.env.MOCK_LIVE === "true";
    const intervalSeconds = Math.max(5, parseInt(process.env.MOCK_LIVE_INTERVAL_SECONDS || "20", 10) || 20);
    return (<div className="-mx-4 -mb-6 -mt-4 flex min-h-[calc(100dvh-4rem)] overflow-hidden sm:-mx-6 sm:-mb-8 lg:-mx-8 lg:-my-8 lg:h-screen">
      {liveEnabled && <LivePoller intervalSeconds={intervalSeconds}/>}
      {children}
    </div>);
}
