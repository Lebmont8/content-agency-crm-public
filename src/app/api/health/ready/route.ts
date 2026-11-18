import { NextResponse } from "next/server";
import { databaseReady } from "@/lib/health";
export const dynamic = "force-dynamic";
export async function GET() {
    const ready = await databaseReady();
    return NextResponse.json({ status: ready ? "ready" : "unavailable" }, {
        status: ready ? 200 : 503,
        headers: { "cache-control": "no-store" },
    });
}
