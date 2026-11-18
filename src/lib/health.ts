import "server-only";
import { db } from "@/lib/db";
export async function databaseReady(): Promise<boolean> {
    try {
        await db.$queryRaw `SELECT 1`;
        return true;
    }
    catch {
        return false;
    }
}
