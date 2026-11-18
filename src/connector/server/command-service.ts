import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import { DESKTOP_CONNECTOR_COMMAND_LEASE_MS, desktopConnectorCommandResultDigest, type DesktopConnectorCommandEnvelope, type DesktopConnectorCommandKind, type DesktopConnectorCommandResult } from "@/connector/protocol";
import { DesktopConnectorError } from "@/connector/server/errors";
import { claimConfirmingDeliveryResult, settleOutboundDeliveryAttempt } from "@/outbox/settlement";
import { evaluateSendGuard } from "@/domain/send-guard";
import { evaluatePilotGate } from "@/pilot/policy";
import { isLivePilotRuntimeReady } from "@/pilot/runtime";
function isUniqueViolation(error: unknown): boolean {
    return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
}
function snapshotManifestDigest(value: Prisma.JsonValue | null): string | null {
    if (!value || Array.isArray(value) || typeof value !== "object")
        return null;
    return value.resource === "MANIFEST" &&
        typeof value.snapshotDigest === "string" &&
        /^[a-f0-9]{64}$/.test(value.snapshotDigest)
        ? value.snapshotDigest
        : null;
}
async function assertFanslySnapshotManifest(tdb: TenantDb, commandId: string, outputDigest: string | null): Promise<void> {
    const manifest = await tdb.auditLog.findFirst({
        where: {
            action: "connector.snapshot.ingested",
            entityType: "DesktopConnectorCommand",
            entityId: commandId,
        },
        orderBy: { createdAt: "desc" },
        select: { after: true },
    });
    if (!outputDigest ||
        snapshotManifestDigest(manifest?.after ?? null) !== outputDigest) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_MANIFEST_REQUIRED", 409, "Fansly snapshot completion requires a matching accepted manifest");
    }
}
export async function enqueueDesktopConnectorCommand(tdb: TenantDb, input: {
    agencyId: string;
    deviceId: string;
    profileId: string;
    kind: DesktopConnectorCommandKind;
    idempotencyKey: string;
    outboundDeliveryId?: string;
    outboundAttemptNumber?: number;
    now?: Date;
}): Promise<{
    commandId: string;
    duplicate: boolean;
}> {
    const existing = await tdb.desktopConnectorCommand.findUnique({
        where: {
            deviceId_idempotencyKey: {
                deviceId: input.deviceId,
                idempotencyKey: input.idempotencyKey,
            },
        },
        select: { id: true },
    });
    if (existing)
        return { commandId: existing.id, duplicate: true };
    const [device, profile] = await Promise.all([
        tdb.desktopConnectorDevice.findUnique({
            where: { id: input.deviceId },
            select: { status: true, revokedAt: true },
        }),
        tdb.desktopConnectorProfile.findUnique({
            where: { id: input.profileId },
            select: {
                deviceId: true,
                status: true,
                connectionId: true,
                creatorAccountId: true,
            },
        }),
    ]);
    if (!device ||
        device.status !== "ACTIVE" ||
        device.revokedAt ||
        !profile ||
        profile.deviceId !== input.deviceId ||
        profile.status === "REVOKED") {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_COMMAND_TARGET_INVALID", 409, "Desktop connector command target is not active");
    }
    if (input.kind === "SEND_TEXT") {
        if (!input.outboundDeliveryId ||
            !input.outboundAttemptNumber ||
            !Number.isSafeInteger(input.outboundAttemptNumber) ||
            input.outboundAttemptNumber <= 0) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_TARGET_INVALID", 400, "Desktop connector text command requires an outbound attempt");
        }
        const delivery = await tdb.outboundDelivery.findUnique({
            where: { id: input.outboundDeliveryId },
            select: {
                creatorAccountId: true,
                connectionId: true,
                kind: true,
                status: true,
                attemptCount: true,
            },
        });
        if (!delivery ||
            delivery.creatorAccountId !== profile.creatorAccountId ||
            delivery.connectionId !== profile.connectionId ||
            delivery.kind !== "TEXT" ||
            delivery.status !== "PROCESSING" ||
            delivery.attemptCount + 1 !== input.outboundAttemptNumber) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_TARGET_INVALID", 409, "Desktop connector text command target is stale");
        }
    }
    else if (input.outboundDeliveryId !== undefined ||
        input.outboundAttemptNumber !== undefined) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_COMMAND_TARGET_INVALID", 400, "Read commands cannot target outbound deliveries");
    }
    const commandId = crypto.randomUUID();
    try {
        await tdb.desktopConnectorCommand.create({
            data: {
                id: commandId,
                agencyId: input.agencyId,
                deviceId: input.deviceId,
                profileId: input.profileId,
                kind: input.kind,
                idempotencyKey: input.idempotencyKey,
                outboundDeliveryId: input.outboundDeliveryId,
                outboundAttemptNumber: input.outboundAttemptNumber,
                nextAttemptAt: input.now ?? new Date(),
            },
        });
        return { commandId, duplicate: false };
    }
    catch (error) {
        if (isUniqueViolation(error)) {
            const raced = await tdb.desktopConnectorCommand.findUnique({
                where: {
                    deviceId_idempotencyKey: {
                        deviceId: input.deviceId,
                        idempotencyKey: input.idempotencyKey,
                    },
                },
                select: { id: true },
            });
            if (raced)
                return { commandId: raced.id, duplicate: true };
        }
        throw error;
    }
}
type ClaimedCommand = {
    id: string;
    deviceId: string;
    profileId: string;
    kind: DesktopConnectorCommandKind;
    status: "PENDING" | "LEASED" | "SUCCEEDED" | "FAILED" | "CANCELED";
    attemptCount: number;
    maxAttempts: number;
    leaseOwner: string | null;
    createdAt: Date;
    outboundDeliveryId: string | null;
    outboundAttemptNumber: number | null;
    profile: {
        platform: string;
    };
    outboundDelivery: {
        status: string;
        kind: string;
        clientRequestId: string;
        fan: {
            externalFanRef: string;
        };
        message: {
            body: string;
            aiMode: string;
        };
        conversation: {
            controlMode: string;
            handoffStatus: string | null;
            takenOverAt: Date | null;
        };
        creatorAccount: {
            platform: string;
            status: string;
            activated: boolean;
            aiAutoReply: boolean;
            pilotMode: string;
            complianceApprovedAt: Date | null;
            dailyAiRunLimit: number;
            dailyAiCostLimitMicros: number;
            agency: {
                status: string;
                pilotEnabled: boolean;
            };
            connection: {
                status: string;
                capabilities: string[];
            } | null;
        };
    } | null;
};
function sendCommandGateCode(command: ClaimedCommand, runtimeReady: boolean): string | null {
    if (command.kind !== "SEND_TEXT")
        return null;
    const delivery = command.outboundDelivery;
    if (command.profile.platform !== "fansly" ||
        !delivery ||
        delivery.status !== "CONFIRMING" ||
        delivery.kind !== "TEXT") {
        return "DESKTOP_CONNECTOR_SEND_TARGET_INVALID";
    }
    const sendGuard = evaluateSendGuard({
        agencyStatus: delivery.creatorAccount.agency.status,
        account: delivery.creatorAccount,
    }, "TEXT");
    if (!sendGuard.allowed)
        return sendGuard.code;
    const pilotGate = evaluatePilotGate({
        runtimeEnabled: runtimeReady,
        agency: delivery.creatorAccount.agency,
        account: delivery.creatorAccount,
    }, delivery.message.aiMode === "AUTO"
        ? "LIVE_PLATFORM_WRITE_AUTO"
        : "LIVE_PLATFORM_WRITE_ASSIST");
    if (!pilotGate.allowed)
        return pilotGate.code;
    if (delivery.message.aiMode === "AUTO" &&
        (delivery.conversation.controlMode === "HUMAN" ||
            Boolean(delivery.conversation.handoffStatus) ||
            delivery.conversation.takenOverAt !== null)) {
        return "HUMAN_TAKEOVER_ACTIVE";
    }
    return null;
}
async function cancelDeniedSendCommand(tdb: TenantDb, command: ClaimedCommand, errorCode: string, now: Date): Promise<boolean> {
    if (command.kind !== "SEND_TEXT")
        return false;
    const canceled = await tdb.desktopConnectorCommand.updateMany({
        where: {
            id: command.id,
            status: command.status,
            ...(command.status === "LEASED"
                ? { leaseOwner: command.leaseOwner }
                : {}),
        },
        data: {
            status: "CANCELED",
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: errorCode,
            completedAt: now,
        },
    });
    if (canceled.count !== 1 || !command.outboundDeliveryId)
        return false;
    await tdb.outboundDelivery.updateMany({
        where: {
            id: command.outboundDeliveryId,
            status: "CONFIRMING",
        },
        data: {
            status: command.status === "PENDING" ? "CANCELED" : "CONFIRMING",
            leaseOwner: null,
            leaseUntil: null,
            lastErrorCode: command.status === "PENDING"
                ? errorCode
                : "DESKTOP_CONNECTOR_SEND_OUTCOME_UNKNOWN_AFTER_GATE",
            lastErrorAt: now,
        },
    });
    return true;
}
function toEnvelope(command: ClaimedCommand, deliveryId: string, now: Date): DesktopConnectorCommandEnvelope {
    if (!["onlyfans", "fansly"].includes(command.profile.platform)) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_COMMAND_PLATFORM_INVALID", 409, "Desktop connector command has an unsupported platform");
    }
    const envelope = {
        id: command.id,
        deliveryId,
        profileId: command.profileId,
        platform: command.profile.platform as "onlyfans" | "fansly",
        kind: command.kind,
        attempt: command.attemptCount,
        issuedAt: now.toISOString(),
    };
    if (command.kind !== "SEND_TEXT")
        return envelope;
    if (command.profile.platform !== "fansly" ||
        !command.outboundDeliveryId ||
        !command.outboundAttemptNumber ||
        !command.outboundDelivery ||
        command.outboundDelivery.kind !== "TEXT" ||
        command.outboundDelivery.status !== "CONFIRMING") {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_TARGET_INVALID", 409, "Desktop connector text command target is not ready");
    }
    return {
        ...envelope,
        kind: "SEND_TEXT",
        sendText: {
            outboundDeliveryId: command.outboundDeliveryId,
            outboundAttemptNumber: command.outboundAttemptNumber,
            externalFanRef: command.outboundDelivery.fan.externalFanRef,
            body: command.outboundDelivery.message.body,
            clientRequestId: command.outboundDelivery.clientRequestId,
        },
    };
}
const commandClaimInclude = {
    profile: { select: { platform: true } },
    outboundDelivery: {
        select: {
            status: true,
            kind: true,
            clientRequestId: true,
            fan: { select: { externalFanRef: true } },
            message: { select: { body: true, aiMode: true } },
            conversation: {
                select: {
                    controlMode: true,
                    handoffStatus: true,
                    takenOverAt: true,
                },
            },
            creatorAccount: {
                select: {
                    platform: true,
                    status: true,
                    activated: true,
                    aiAutoReply: true,
                    pilotMode: true,
                    complianceApprovedAt: true,
                    dailyAiRunLimit: true,
                    dailyAiCostLimitMicros: true,
                    agency: { select: { status: true, pilotEnabled: true } },
                    connection: {
                        select: {
                            status: true,
                            capabilities: true,
                        },
                    },
                },
            },
        },
    },
} as const;
export async function claimDesktopConnectorCommand(tdb: TenantDb, input: {
    deviceId: string;
    deliveryId: string;
    allowNewClaim?: boolean;
    runtimeReady?: boolean;
    now?: Date;
}): Promise<DesktopConnectorCommandEnvelope | null> {
    const now = input.now ?? new Date();
    const runtimeReady = input.runtimeReady ?? isLivePilotRuntimeReady();
    const duplicatePoll = await tdb.desktopConnectorCommand.findFirst({
        where: {
            deviceId: input.deviceId,
            status: "LEASED",
            leaseOwner: input.deliveryId,
        },
        include: commandClaimInclude,
    });
    if (duplicatePoll) {
        const duplicateCommand = duplicatePoll as ClaimedCommand;
        const gateCode = sendCommandGateCode(duplicateCommand, runtimeReady);
        if (gateCode) {
            await cancelDeniedSendCommand(tdb, duplicateCommand, gateCode, now);
            return null;
        }
        return toEnvelope(duplicateCommand, input.deliveryId, now);
    }
    if (input.allowNewClaim === false)
        return null;
    const candidate = await tdb.desktopConnectorCommand.findFirst({
        where: {
            deviceId: input.deviceId,
            nextAttemptAt: { lte: now },
            AND: [
                {
                    OR: [
                        { status: "PENDING" },
                        { status: "LEASED", leaseUntil: { lt: now } },
                    ],
                },
                {
                    OR: [
                        { kind: { not: "SEND_TEXT" } },
                        {
                            kind: "SEND_TEXT",
                            outboundDelivery: { is: { status: "CONFIRMING" } },
                        },
                    ],
                },
            ],
        },
        orderBy: { createdAt: "asc" },
        include: commandClaimInclude,
    });
    if (!candidate)
        return null;
    const claimedCandidate = candidate as ClaimedCommand;
    const gateCode = sendCommandGateCode(claimedCandidate, runtimeReady);
    if (gateCode) {
        await cancelDeniedSendCommand(tdb, claimedCandidate, gateCode, now);
        return null;
    }
    if (candidate.attemptCount >= candidate.maxAttempts) {
        await tdb.desktopConnectorCommand.updateMany({
            where: {
                id: candidate.id,
                deviceId: input.deviceId,
                status: { in: ["PENDING", "LEASED"] },
            },
            data: {
                status: "FAILED",
                leaseOwner: null,
                leaseUntil: null,
                lastErrorCode: "DESKTOP_CONNECTOR_MAX_ATTEMPTS",
                completedAt: now,
            },
        });
        if (candidate.kind === "SEND_TEXT" && candidate.outboundDeliveryId) {
            await tdb.outboundDelivery.updateMany({
                where: {
                    id: candidate.outboundDeliveryId,
                    status: "CONFIRMING",
                },
                data: {
                    lastErrorCode: "DESKTOP_CONNECTOR_SEND_RESULT_MISSING",
                    lastErrorAt: now,
                },
            });
        }
        return null;
    }
    const claimed = await tdb.desktopConnectorCommand.updateMany({
        where: {
            id: candidate.id,
            deviceId: input.deviceId,
            nextAttemptAt: { lte: now },
            AND: [
                {
                    OR: [
                        { status: "PENDING" },
                        { status: "LEASED", leaseUntil: { lt: now } },
                    ],
                },
                {
                    OR: [
                        { kind: { not: "SEND_TEXT" } },
                        {
                            kind: "SEND_TEXT",
                            outboundDelivery: { is: { status: "CONFIRMING" } },
                        },
                    ],
                },
            ],
        },
        data: {
            status: "LEASED",
            leaseOwner: input.deliveryId,
            leaseUntil: new Date(now.getTime() + DESKTOP_CONNECTOR_COMMAND_LEASE_MS),
            attemptCount: { increment: 1 },
            lastErrorCode: null,
        },
    });
    if (claimed.count !== 1)
        return null;
    const command = await tdb.desktopConnectorCommand.findUnique({
        where: { id: candidate.id },
        include: commandClaimInclude,
    });
    return command
        ? toEnvelope(command as ClaimedCommand, input.deliveryId, now)
        : null;
}
export async function completeDesktopConnectorCommand(tdb: TenantDb, input: {
    deviceId: string;
    result: DesktopConnectorCommandResult;
    now?: Date;
}): Promise<{
    duplicate: boolean;
}> {
    const now = input.now ?? new Date();
    const resultDigest = desktopConnectorCommandResultDigest(input.result);
    const target = await tdb.desktopConnectorCommand.findUnique({
        where: { id: input.result.commandId },
        select: {
            kind: true,
            outboundDeliveryId: true,
            outboundAttemptNumber: true,
            profile: { select: { platform: true } },
        },
    });
    if (input.result.verifiedCapabilities?.length &&
        (target?.kind !== "VERIFY_PROFILE" || !input.result.ok)) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_RESULT_INVALID", 400, "Only a successful profile verification may attest capabilities");
    }
    if (target?.kind === "SEND_TEXT") {
        const validSuccess = input.result.ok &&
            Boolean(input.result.providerExternalRef) &&
            Boolean(input.result.sentAt) &&
            !input.result.failureKind;
        const validFailure = !input.result.ok &&
            Boolean(input.result.failureKind) &&
            !input.result.providerExternalRef &&
            !input.result.sentAt;
        if (target.profile.platform !== "fansly" ||
            !target.outboundDeliveryId ||
            !target.outboundAttemptNumber ||
            (!validSuccess && !validFailure)) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_RESULT_INVALID", 400, "Desktop connector text result is incomplete");
        }
    }
    else if (input.result.failureKind ||
        input.result.providerExternalRef ||
        input.result.sentAt) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_RESULT_INVALID", 400, "Read command results cannot include a delivery receipt");
    }
    if (input.result.ok &&
        target?.kind === "SYNC_SNAPSHOT" &&
        target.profile.platform === "fansly") {
        await assertFanslySnapshotManifest(tdb, input.result.commandId, input.result.outputDigest);
    }
    const completed = await tdb.desktopConnectorCommand.updateMany({
        where: {
            id: input.result.commandId,
            deviceId: input.deviceId,
            status: "LEASED",
            leaseOwner: input.result.deliveryId,
        },
        data: {
            status: input.result.ok ? "SUCCEEDED" : "FAILED",
            leaseOwner: null,
            leaseUntil: null,
            resultDigest,
            lastErrorCode: input.result.ok ? null : input.result.resultCode,
            completedAt: now,
        },
    });
    const command = await tdb.desktopConnectorCommand.findUnique({
        where: { id: input.result.commandId },
        select: {
            id: true,
            agencyId: true,
            deviceId: true,
            status: true,
            resultDigest: true,
            kind: true,
            profileId: true,
            outboundDeliveryId: true,
            outboundAttemptNumber: true,
            createdAt: true,
            profile: {
                select: {
                    platform: true,
                    connectionId: true,
                    creatorAccountId: true,
                    connection: {
                        select: {
                            remoteAccountId: true,
                            status: true,
                            grantedScopes: true,
                            capabilities: true,
                        },
                    },
                },
            },
        },
    });
    const duplicate = completed.count !== 1 &&
        command?.deviceId === input.deviceId &&
        ["SUCCEEDED", "FAILED"].includes(command.status) &&
        command.resultDigest === resultDigest;
    if (completed.count !== 1 &&
        !duplicate) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_COMMAND_RESULT_CONFLICT", 409, "Desktop connector command result is stale or conflicts with prior state");
    }
    if (!command) {
        throw new DesktopConnectorError("DESKTOP_CONNECTOR_COMMAND_RESULT_CONFLICT", 409, "Desktop connector command no longer exists");
    }
    if (command.kind === "VERIFY_PROFILE") {
        await tdb.desktopConnectorProfile.updateMany({
            where: {
                id: command.profileId,
                deviceId: input.deviceId,
                status: { not: "REVOKED" },
            },
            data: input.result.ok
                ? {
                    status: "READY",
                    lastVerifiedAt: now,
                    lastErrorCode: null,
                }
                : {
                    status: "ERROR",
                    lastVerifiedAt: null,
                    lastErrorCode: input.result.resultCode,
                },
        });
        if (input.result.ok &&
            command.profile?.platform === "fansly" &&
            command.profile.connection.remoteAccountId) {
            const canSendText = input.result.verifiedCapabilities?.includes("send_text") ?? false;
            await enqueueDesktopConnectorCommand(tdb, {
                agencyId: command.agencyId,
                deviceId: input.deviceId,
                profileId: command.profileId,
                kind: "SYNC_SNAPSHOT",
                idempotencyKey: `sync-snapshot:${command.profileId}:initial:v1`,
                now,
            });
            await tdb.platformConnection.updateMany({
                where: {
                    id: command.profile.connectionId,
                    status: { not: "REVOKED" },
                },
                data: {
                    status: "SYNCING",
                    grantedScopes: canSendText ? ["write:messages"] : [],
                    capabilities: canSendText
                        ? ["send_text", "auto_reply"]
                        : [],
                    lastSyncStartedAt: now,
                    lastErrorCode: null,
                },
            });
        }
    }
    else if (command.kind === "SYNC_SNAPSHOT" &&
        command.profile?.platform === "fansly") {
        if (input.result.ok) {
            if (!command.profile.connection.remoteAccountId) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_IDENTITY_REQUIRED", 409, "Fansly snapshot cannot activate without a verified identity");
            }
            const activated = await tdb.platformConnection.updateMany({
                where: {
                    id: command.profile.connectionId,
                    creatorAccountId: command.profile.creatorAccountId,
                    platform: "fansly",
                    status: { not: "REVOKED" },
                    remoteAccountId: command.profile.connection.remoteAccountId,
                },
                data: {
                    status: "ACTIVE",
                    capabilities: Array.from(new Set([
                        "sync",
                        ...(command.profile.connection.capabilities ?? []).filter((capability) => ["send_text", "auto_reply"].includes(capability)),
                    ])),
                    grantedScopes: Array.from(new Set([
                        "read:identity",
                        "read:fans",
                        "read:messages",
                        "read:transactions",
                        "read:vault_metadata",
                        ...(command.profile.connection.grantedScopes ?? []).filter((scope) => scope === "write:messages"),
                    ])),
                    lastSyncedAt: now,
                    lastErrorCode: null,
                },
            });
            if (activated.count !== 1) {
                throw new DesktopConnectorError("DESKTOP_CONNECTOR_SNAPSHOT_CONNECTION_INVALID", 409, "Fansly snapshot connection is no longer active");
            }
        }
        else {
            await tdb.platformConnection.updateMany({
                where: {
                    id: command.profile.connectionId,
                    status: { not: "REVOKED" },
                },
                data: {
                    status: "ERROR",
                    lastErrorCode: input.result.resultCode,
                },
            });
        }
    }
    else if (command.kind === "SEND_TEXT") {
        if (command.profile?.platform !== "fansly" ||
            !command.outboundDeliveryId ||
            !command.outboundAttemptNumber) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_TARGET_INVALID", 409, "Desktop connector text command target is missing");
        }
        const resultLeaseOwner = `desktop-result:${command.id}`;
        const claimed = await claimConfirmingDeliveryResult(tdb, {
            deliveryId: command.outboundDeliveryId,
            attemptNumber: command.outboundAttemptNumber,
            leaseOwner: resultLeaseOwner,
            now,
        });
        const activeLease = claimed
            ? true
            : Boolean(await tdb.outboundDelivery.findFirst({
                where: {
                    id: command.outboundDeliveryId,
                    status: "PROCESSING",
                    attemptCount: command.outboundAttemptNumber - 1,
                    leaseOwner: resultLeaseOwner,
                },
                select: { id: true },
            }));
        if (activeLease) {
            await settleOutboundDeliveryAttempt(tdb, {
                agencyId: command.agencyId,
                deliveryId: command.outboundDeliveryId,
                attemptNumber: command.outboundAttemptNumber,
                leaseOwner: resultLeaseOwner,
                startedAt: command.createdAt,
                finishedAt: now,
                result: input.result.ok
                    ? {
                        ok: true,
                        externalRef: input.result.providerExternalRef ?? undefined,
                        sentAt: input.result.sentAt
                            ? new Date(input.result.sentAt)
                            : undefined,
                    }
                    : {
                        ok: false,
                        failureKind: input.result.failureKind ?? "AMBIGUOUS",
                        errorCode: input.result.resultCode,
                    },
            });
        }
        const settled = await tdb.outboundDelivery.findUnique({
            where: { id: command.outboundDeliveryId },
            select: { status: true, attemptCount: true },
        });
        if (!settled ||
            settled.attemptCount < command.outboundAttemptNumber ||
            ["PROCESSING", "CONFIRMING"].includes(settled.status)) {
            throw new DesktopConnectorError("DESKTOP_CONNECTOR_SEND_SETTLEMENT_PENDING", 503, "Desktop connector text result is not settled yet");
        }
    }
    return { duplicate };
}
