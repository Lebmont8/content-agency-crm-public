import "server-only";
import crypto from "node:crypto";
import type { TenantDb } from "@/lib/tenant-db";
import { credentialAad, decryptJson, encryptJson, parseCredentialKey, platformTokenSchema, type PlatformTokenPayload } from "@/platform/secrets/credential-crypto";
const CURRENT_KEY_VERSION = 1;
function credentialKey(): Buffer {
    const raw = process.env.PLATFORM_CREDENTIAL_KEY;
    if (!raw)
        throw new Error("PLATFORM_CREDENTIAL_KEY is not configured");
    return parseCredentialKey(raw);
}
export async function savePlatformTokens(tdb: TenantDb, agencyId: string, connectionId: string, payload: PlatformTokenPayload): Promise<{
    id: string;
    version: number;
}> {
    const verified = platformTokenSchema.parse(payload);
    const encrypted = encryptJson(verified, credentialKey(), credentialAad(agencyId, connectionId, CURRENT_KEY_VERSION));
    const existing = await tdb.platformCredential.findUnique({
        where: { agencyId_connectionId: { agencyId, connectionId } },
    });
    if (existing) {
        const updated = await tdb.platformCredential.update({
            where: { id: existing.id },
            data: {
                ...encrypted,
                keyVersion: CURRENT_KEY_VERSION,
                version: { increment: 1 },
                refreshLeaseOwner: null,
                refreshLeaseUntil: null,
            },
        });
        return { id: updated.id, version: updated.version };
    }
    const created = await tdb.platformCredential.create({
        data: {
            agencyId,
            connectionId,
            ...encrypted,
            keyVersion: CURRENT_KEY_VERSION,
        },
    });
    return { id: created.id, version: created.version };
}
export async function loadPlatformTokens(tdb: TenantDb, agencyId: string, connectionId: string): Promise<{
    id: string;
    version: number;
    payload: PlatformTokenPayload;
}> {
    const row = await tdb.platformCredential.findUnique({
        where: { agencyId_connectionId: { agencyId, connectionId } },
    });
    if (!row)
        throw new Error("Platform credential not found");
    const value = decryptJson({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag }, credentialKey(), credentialAad(agencyId, connectionId, row.keyVersion));
    return { id: row.id, version: row.version, payload: platformTokenSchema.parse(value) };
}
export async function deletePlatformTokens(tdb: TenantDb, agencyId: string, connectionId: string): Promise<void> {
    await tdb.platformCredential.deleteMany({ where: { agencyId, connectionId } });
}
export async function acquireRefreshLease(tdb: TenantDb, agencyId: string, connectionId: string, leaseMs = 30000): Promise<string | null> {
    const row = await tdb.platformCredential.findUnique({
        where: { agencyId_connectionId: { agencyId, connectionId } },
        select: { id: true },
    });
    if (!row)
        throw new Error("Platform credential not found");
    const owner = crypto.randomUUID();
    const now = new Date();
    const acquired = await tdb.platformCredential.updateMany({
        where: {
            id: row.id,
            OR: [{ refreshLeaseUntil: null }, { refreshLeaseUntil: { lt: now } }],
        },
        data: {
            refreshLeaseOwner: owner,
            refreshLeaseUntil: new Date(now.getTime() + leaseMs),
        },
    });
    return acquired.count === 1 ? owner : null;
}
export async function releaseRefreshLease(tdb: TenantDb, agencyId: string, connectionId: string, owner: string): Promise<void> {
    await tdb.platformCredential.updateMany({
        where: { agencyId, connectionId, refreshLeaseOwner: owner },
        data: { refreshLeaseOwner: null, refreshLeaseUntil: null },
    });
}
