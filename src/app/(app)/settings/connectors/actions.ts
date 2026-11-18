"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { logAudit } from "@/domain/audit";
import { desktopConnectorPairingIssueSchema, desktopConnectorProfileBindingSchema } from "@/connector/protocol";
import { bindDesktopConnectorProfile, issueDesktopConnectorPairing, revokeDesktopConnectorDevice } from "@/connector/server/device-service";
import { DesktopConnectorError } from "@/connector/server/errors";
export type PairingActionState = {
    errorCode?: string;
    pairing?: {
        deviceId: string;
        pairingCode: string;
        expiresAt: string;
    };
} | null;
export type ConnectorMutationState = {
    errorCode?: string;
    result?: "BOUND" | "ALREADY_BOUND" | "REVOKED" | "ALREADY_REVOKED";
} | null;
function knownConnectorError(error: unknown): ConnectorMutationState {
    if (error instanceof DesktopConnectorError) {
        return { errorCode: error.code };
    }
    throw error;
}
export async function issueConnectorPairing(_previous: PairingActionState, formData: FormData): Promise<PairingActionState> {
    const { user } = await requireRole("OWNER");
    const parsed = desktopConnectorPairingIssueSchema.safeParse({
        label: formData.get("label"),
    });
    if (!parsed.success) {
        return { errorCode: "DESKTOP_CONNECTOR_PAIRING_INVALID" };
    }
    const tdb = getTenantDb(user.agencyId);
    const pairing = await issueDesktopConnectorPairing(tdb, {
        agencyId: user.agencyId,
        pairedByUserId: user.id,
        label: parsed.data.label,
    });
    await logAudit(tdb, user.agencyId, {
        actorId: user.id,
        action: "connector.device.pairing_created",
        entityType: "DesktopConnectorDevice",
        entityId: pairing.deviceId,
        after: {
            status: "PAIRING",
            expiresAt: pairing.expiresAt.toISOString(),
        },
    });
    revalidatePath("/settings/connectors");
    return {
        pairing: {
            deviceId: pairing.deviceId,
            pairingCode: pairing.pairingCode,
            expiresAt: pairing.expiresAt.toISOString(),
        },
    };
}
export async function bindConnectorProfile(_previous: ConnectorMutationState, formData: FormData): Promise<ConnectorMutationState> {
    const { user } = await requireRole("OWNER");
    const parsed = desktopConnectorProfileBindingSchema.safeParse({
        deviceId: formData.get("deviceId"),
        creatorAccountId: formData.get("creatorAccountId"),
    });
    if (!parsed.success) {
        return { errorCode: "DESKTOP_CONNECTOR_PROFILE_INVALID" };
    }
    const tdb = getTenantDb(user.agencyId);
    try {
        const binding = await bindDesktopConnectorProfile(tdb, {
            agencyId: user.agencyId,
            deviceId: parsed.data.deviceId,
            creatorAccountId: parsed.data.creatorAccountId,
        });
        if (!binding.duplicate) {
            await logAudit(tdb, user.agencyId, {
                actorId: user.id,
                action: "connector.profile.bound",
                entityType: "DesktopConnectorProfile",
                entityId: binding.profileId,
                after: {
                    deviceId: parsed.data.deviceId,
                    creatorAccountId: parsed.data.creatorAccountId,
                    status: "LOCKED",
                },
            });
        }
        revalidatePath("/settings/connectors");
        revalidatePath("/settings/accounts");
        return { result: binding.duplicate ? "ALREADY_BOUND" : "BOUND" };
    }
    catch (error) {
        return knownConnectorError(error);
    }
}
export async function revokeConnectorDevice(_previous: ConnectorMutationState, formData: FormData): Promise<ConnectorMutationState> {
    const { user } = await requireRole("OWNER");
    const parsed = z
        .object({ deviceId: z.string().min(1).max(128) })
        .strict()
        .safeParse({ deviceId: formData.get("deviceId") });
    if (!parsed.success) {
        return { errorCode: "DESKTOP_CONNECTOR_DEVICE_INVALID" };
    }
    const tdb = getTenantDb(user.agencyId);
    try {
        const revoked = await revokeDesktopConnectorDevice(tdb, parsed.data.deviceId);
        if (revoked) {
            await logAudit(tdb, user.agencyId, {
                actorId: user.id,
                action: "connector.device.revoked",
                entityType: "DesktopConnectorDevice",
                entityId: parsed.data.deviceId,
                after: { status: "REVOKED" },
            });
        }
        revalidatePath("/settings/connectors");
        revalidatePath("/settings/accounts");
        return { result: revoked ? "REVOKED" : "ALREADY_REVOKED" };
    }
    catch (error) {
        return knownConnectorError(error);
    }
}
