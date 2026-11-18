import "server-only";
import { db } from "@/lib/db";
export async function resolveFanvueWebhookConnection(remoteAccountId: string): Promise<{
    agencyId: string;
    connectionId: string;
} | null> {
    if (!remoteAccountId)
        return null;
    const connection = await db.platformConnection.findUnique({
        where: {
            platform_remoteAccountId: {
                platform: "fanvue",
                remoteAccountId,
            },
        },
        select: {
            id: true,
            agencyId: true,
            status: true,
            creatorAccount: { select: { status: true } },
        },
    });
    if (!connection ||
        connection.status !== "ACTIVE" ||
        connection.creatorAccount.status !== "ACTIVE") {
        return null;
    }
    return { agencyId: connection.agencyId, connectionId: connection.id };
}
