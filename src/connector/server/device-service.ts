import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { TenantDb } from "@/lib/tenant-db";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/auth-token";
import { DESKTOP_CONNECTOR_PROTOCOL_VERSION, DESKTOP_CONNECTOR_REQUEST_TTL_MS, desktopConnectorPairRequestSchema, normalizeEd25519PublicKey, type DesktopConnectorHeartbeat } from "@/connector/protocol";
import { DesktopConnectorError } from "@/connector/server/errors";
const PAIRING_TTL_MS = 10 * 60 * 1000;
type PairingDeviceRow = {
    id: string;
    agencyId: string;
    pairedByUserId: string;
    status: string;
    pairingExpiresAt: Date | null;
};
type PairingDatabase = {
    desktopConnectorDevice: {
        findUnique(args: unknown): Promise<PairingDeviceRow | null>;
        updateMany(args: unknown): Promise<{
            count: number;
        }>;
    };
};
function isUniqueViolation(error: unknown): boolean {
    return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
}
export async function issueDesktopConnectorPairing(tdb: TenantDb, input: {
    agencyId: string;
    pairedByUserId: string;
    label: string;
    now?: Date;
}): Promise<{
    deviceId: string;
    pairingCode: string;
    expiresAt: Date;
}> {
    const now = input.now ?? new Date();
    const pairingCode = createOpaqueToken();
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
    const device = await tdb.desktopConnectorDevice.create({
        data: {
            agencyId: input.agencyId,
            pairedByUserId: input.pairedByUserId,
            label: input.label,
            status: "PAIRING",
            pairingCodeHash: hashOpaqueToken(pairingCode),
            pairingExpiresAt: expiresAt,
        },
        select: { id: true },
    });
    return { deviceId: device.id, pairingCode, expiresAt };
}
export async function claimDesktopConnectorPairing(database: PairingDatabase, rawInput: unknown, now = new Date()): Promise<{
    agencyId: string;
    pairedByUserId: string;
    deviceId: string;
    deviceToken: string;
}> {
    const parsed = desktopConnectorPairRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_PAIRING_INVALID", 400, "Desktop connector pairing request is invalid");
    }
    let publicKeySpki: string;
    try {
        publicKeySpki = normalizeEd25519PublicKey(parsed.data.publicKeySpki);
    }
    catch {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_PAIRING_INVALID", 400, "Desktop connector pairing request is invalid");
    }
    const pairingCodeHash = hashOpaqueToken(parsed.data.pairingCode);
    const pending = await database.desktopConnectorDevice.findUnique({
        where: { pairingCodeHash },
        select: {
            id: true,
            agencyId: true,
            pairedByUserId: true,
            status: true,
            pairingExpiresAt: true,
        },
    });
    if (!pending || pending.status !== "PAIRING" || !pending.pairingExpiresAt) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_PAIRING_INVALID", 401, "Desktop connector pairing code is invalid");
    }
    if (pending.pairingExpiresAt <= now) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_PAIRING_EXPIRED", 410, "Desktop connector pairing code expired");
    }
    const deviceToken = createOpaqueToken();
    const claimed = await database.desktopConnectorDevice.updateMany({
        where: {
            id: pending.id,
            status: "PAIRING",
            pairingCodeHash,
            pairingExpiresAt: { gt: now },
            revokedAt: null,
        },
        data: {
            status: "ACTIVE",
            label: parsed.data.label,
            pairingCodeHash: null,
            pairingExpiresAt: null,
            tokenHash: hashOpaqueToken(deviceToken),
            publicKeySpki,
            protocolVersion: DESKTOP_CONNECTOR_PROTOCOL_VERSION,
            appVersion: parsed.data.appVersion,
            pairedAt: now,
            lastSeenAt: now,
        },
    });
    if (claimed.count !== 1) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_PAIRING_ALREADY_USED", 409, "Desktop connector pairing code was already used");
    }
    return {
        agencyId: pending.agencyId,
        pairedByUserId: pending.pairedByUserId,
        deviceId: pending.id,
        deviceToken,
    };
}
export async function claimPendingDesktopConnectorPairing(rawInput: unknown, now = new Date()) {
    return claimDesktopConnectorPairing(db, rawInput, now);
}
export async function recordDesktopConnectorRequest(tdb: TenantDb, input: {
    agencyId: string;
    deviceId: string;
    requestId: string;
    kind: string;
    requestDigest: string;
    now?: Date;
}): Promise<{
    duplicate: boolean;
}> {
    const existing = await tdb.desktopConnectorRequest.findUnique({
        where: {
            deviceId_requestId: {
                deviceId: input.deviceId,
                requestId: input.requestId,
            },
        },
        select: { kind: true, requestDigest: true },
    });
    if (existing) {
        if (existing.kind !== input.kind ||
            existing.requestDigest !== input.requestDigest) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_REPLAY_CONFLICT", 409, "Desktop connector request id was reused with different content");
        }
        return { duplicate: true };
    }
    const now = input.now ?? new Date();
    try {
        await tdb.desktopConnectorRequest.create({
            data: {
                agencyId: input.agencyId,
                deviceId: input.deviceId,
                requestId: input.requestId,
                kind: input.kind,
                requestDigest: input.requestDigest,
                receivedAt: now,
                expiresAt: new Date(now.getTime() + DESKTOP_CONNECTOR_REQUEST_TTL_MS),
            },
        });
        return { duplicate: false };
    }
    catch (error) {
        if (isUniqueViolation(error)) {
            const raced = await tdb.desktopConnectorRequest.findUnique({
                where: {
                    deviceId_requestId: {
                        deviceId: input.deviceId,
                        requestId: input.requestId,
                    },
                },
                select: { kind: true, requestDigest: true },
            });
            if (raced?.kind === input.kind &&
                raced.requestDigest === input.requestDigest) {
                return { duplicate: true };
            }
            if (raced) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_REPLAY_CONFLICT", 409, "Desktop connector request id was reused with different content");
            }
        }
        throw error;
    }
}
export async function recordDesktopConnectorHeartbeat(tdb: TenantDb, input: {
    deviceId: string;
    heartbeat: DesktopConnectorHeartbeat;
    now?: Date;
}): Promise<void> {
    const now = input.now ?? new Date();
    const updated = await tdb.desktopConnectorDevice.updateMany({
        where: {
            id: input.deviceId,
            status: "ACTIVE",
            revokedAt: null,
        },
        data: {
            protocolVersion: input.heartbeat.protocolVersion,
            appVersion: input.heartbeat.appVersion,
            lastSeenAt: now,
        },
    });
    if (updated.count !== 1) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_REVOKED", 401, "Desktop connector is no longer active");
    }
    await tdb.desktopConnectorRequest.deleteMany({
        where: {
            deviceId: input.deviceId,
            expiresAt: { lt: now },
        },
    });
    await Promise.all(input.heartbeat.profiles.map((profile) => tdb.desktopConnectorProfile.updateMany({
        where: {
            id: profile.profileId,
            deviceId: input.deviceId,
            status: { not: "REVOKED" },
        },
        data: {
            status: profile.status,
            lastVerifiedAt: profile.status === "READY" ? now : null,
            lastErrorCode: profile.status === "READY" ? null : profile.errorCode,
        },
    })));
}
export async function bindDesktopConnectorProfile(tdb: TenantDb, input: {
    agencyId: string;
    deviceId: string;
    creatorAccountId: string;
    now?: Date;
}): Promise<{
    profileId: string;
    commandId: string;
    duplicate: boolean;
}> {
    const existing = await tdb.desktopConnectorProfile.findUnique({
        where: {
            agencyId_creatorAccountId: {
                agencyId: input.agencyId,
                creatorAccountId: input.creatorAccountId,
            },
        },
        select: { id: true, deviceId: true },
    });
    if (existing) {
        if (existing.deviceId !== input.deviceId) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_PROFILE_ALREADY_BOUND", 409, "Creator account is already bound to another desktop connector");
        }
        const command = await tdb.desktopConnectorCommand.findUnique({
            where: {
                deviceId_idempotencyKey: {
                    deviceId: input.deviceId,
                    idempotencyKey: `verify-profile:${existing.id}:v1`,
                },
            },
            select: { id: true },
        });
        if (!command) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_PROFILE_INCOMPLETE", 409, "Desktop connector profile binding is incomplete");
        }
        return {
            profileId: existing.id,
            commandId: command.id,
            duplicate: true,
        };
    }
    const [device, account] = await Promise.all([
        tdb.desktopConnectorDevice.findUnique({
            where: { id: input.deviceId },
            select: { id: true, status: true, revokedAt: true },
        }),
        tdb.creatorAccount.findUnique({
            where: { id: input.creatorAccountId },
            include: { connection: true },
        }),
    ]);
    if (!device || device.status !== "ACTIVE" || device.revokedAt) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_DEVICE_NOT_ACTIVE", 409, "Desktop connector device is not active");
    }
    if (!account ||
        !account.connection ||
        !["onlyfans", "fansly"].includes(account.platform)) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_ACCOUNT_INVALID", 400, "OnlyFans or Fansly account with a connection is required");
    }
    const now = input.now ?? new Date();
    const profileId = crypto.randomUUID();
    const commandId = crypto.randomUUID();
    await tdb.$transaction([
        tdb.desktopConnectorProfile.create({
            data: {
                id: profileId,
                agencyId: input.agencyId,
                deviceId: input.deviceId,
                creatorAccountId: account.id,
                connectionId: account.connection.id,
                platform: account.platform,
                status: "LOCKED",
            },
        }),
        tdb.platformConnection.update({
            where: { id: account.connection.id },
            data: {
                status: "VERIFYING",
                remoteAccountId: null,
                secretRef: `desktop-profile:${profileId}`,
                grantedScopes: [],
                capabilities: [],
                lastVerifiedAt: null,
                expiresAt: null,
                lastErrorCode: null,
            },
        }),
        tdb.desktopConnectorCommand.create({
            data: {
                id: commandId,
                agencyId: input.agencyId,
                deviceId: input.deviceId,
                profileId,
                kind: "VERIFY_PROFILE",
                idempotencyKey: `verify-profile:${profileId}:v1`,
                nextAttemptAt: now,
            },
        }),
    ]);
    return { profileId, commandId, duplicate: false };
}
export async function revokeDesktopConnectorDevice(tdb: TenantDb, deviceId: string, now = new Date()): Promise<boolean> {
    const device = await tdb.desktopConnectorDevice.findUnique({
        where: { id: deviceId },
        select: { id: true, status: true },
    });
    if (!device || device.status === "REVOKED")
        return false;
    const profiles = await tdb.desktopConnectorProfile.findMany({
        where: { deviceId },
        select: { connectionId: true, creatorAccountId: true },
    });
    const connectionIds = profiles.map((profile) => profile.connectionId);
    const accountIds = profiles.map((profile) => profile.creatorAccountId);
    const [revoked] = await tdb.$transaction([
        tdb.desktopConnectorDevice.updateMany({
            where: { id: deviceId, status: { not: "REVOKED" } },
            data: {
                status: "REVOKED",
                pairingCodeHash: null,
                pairingExpiresAt: null,
                tokenHash: null,
                revokedAt: now,
            },
        }),
        tdb.desktopConnectorCommand.updateMany({
            where: {
                deviceId,
                status: { in: ["PENDING", "LEASED"] },
            },
            data: {
                status: "CANCELED",
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: "DESKTOP_CONNECTOR_DEVICE_REVOKED",
                completedAt: now,
            },
        }),
        tdb.desktopConnectorProfile.updateMany({
            where: { deviceId, status: { not: "REVOKED" } },
            data: {
                status: "REVOKED",
                lastVerifiedAt: null,
                lastErrorCode: "DESKTOP_CONNECTOR_DEVICE_REVOKED",
            },
        }),
        tdb.platformConnection.updateMany({
            where: { id: { in: connectionIds } },
            data: {
                status: "REVOKED",
                secretRef: null,
                grantedScopes: [],
                capabilities: [],
                lastVerifiedAt: null,
                syncLeaseOwner: null,
                syncLeaseUntil: null,
                lastErrorCode: "DESKTOP_CONNECTOR_DEVICE_REVOKED",
            },
        }),
        tdb.creatorAccount.updateMany({
            where: { id: { in: accountIds } },
            data: { status: "DISCONNECTED", aiAutoReply: false },
        }),
    ]);
    return revoked.count === 1;
}
