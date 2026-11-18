"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { destroySession, requireAuth } from "@/lib/session";
import { getTenantDb } from "@/lib/tenant-db";
import { authenticateMfaManagement, regenerateMfaRecoveryCodes, replaceMfaCredential } from "@/auth/mfa-management";
import { ensurePendingMfaCredential, requiresMfa } from "@/auth/mfa";
import { startMfaChallenge } from "@/auth/mfa-challenge";
import { logAudit } from "@/domain/audit";
import { currentTrustedDeviceId, revokeAllTrustedDevices, revokeTrustedDevice } from "@/auth/trusted-device";
export type SecurityActionState = {
    error?: string;
    recoveryCodes?: string[];
} | null;
const managementSchema = z.object({
    password: z.string().min(1).max(200),
    factor: z.string().min(6).max(64),
});
export async function beginMfaSetup(): Promise<void> {
    const auth = await requireAuth();
    await ensurePendingMfaCredential(auth.user);
    await startMfaChallenge(auth.user, "SETUP");
    await destroySession();
    redirect("/mfa/setup");
}
async function authenticate(formData: FormData) {
    const auth = await requireAuth();
    if (!requiresMfa(auth.user))
        return null;
    const parsed = managementSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return null;
    const verified = await authenticateMfaManagement(auth.user.agencyId, auth.user.id, parsed.data.password, parsed.data.factor);
    return verified ? { auth, verified } : null;
}
export async function regenerateRecoveryCodes(_prev: SecurityActionState, formData: FormData): Promise<SecurityActionState> {
    const result = await authenticate(formData);
    if (!result)
        return { error: "Password or second factor is invalid" };
    const codes = await regenerateMfaRecoveryCodes(result.auth.user.agencyId, result.verified.credential.id);
    await logAudit(getTenantDb(result.auth.user.agencyId), result.auth.user.agencyId, {
        actorId: result.auth.user.id,
        action: "auth.mfa_recovery_regenerated",
        entityType: "User",
        entityId: result.auth.user.id,
        after: { recoveryCodeCount: codes.length },
    });
    return { recoveryCodes: codes };
}
export async function replaceAuthenticator(_prev: SecurityActionState, formData: FormData): Promise<SecurityActionState> {
    const result = await authenticate(formData);
    if (!result)
        return { error: "Password or second factor is invalid" };
    await replaceMfaCredential(result.verified.user);
    await logAudit(getTenantDb(result.auth.user.agencyId), result.auth.user.agencyId, {
        actorId: result.auth.user.id,
        action: "auth.mfa_replaced",
        entityType: "User",
        entityId: result.auth.user.id,
    });
    await startMfaChallenge(result.auth.user, "SETUP");
    await destroySession();
    redirect("/mfa/setup");
}
export async function revokeRememberedDevice(formData: FormData): Promise<void> {
    const auth = await requireAuth();
    const deviceId = z.string().min(1).parse(formData.get("deviceId"));
    const result = await revokeTrustedDevice(auth.user.agencyId, auth.user.id, deviceId);
    if (!result.revoked)
        return;
    await logAudit(getTenantDb(auth.user.agencyId), auth.user.agencyId, {
        actorId: auth.user.id,
        action: "auth.trusted_device_revoked",
        entityType: "TrustedDevice",
        entityId: deviceId,
    });
    if (result.current) {
        await destroySession();
        redirect("/login");
    }
    revalidatePath("/settings/security");
}
export async function revokeAllRememberedDevices(): Promise<void> {
    const auth = await requireAuth();
    const currentId = await currentTrustedDeviceId(auth.user.id);
    const count = await revokeAllTrustedDevices(auth.user.agencyId, auth.user.id);
    await logAudit(getTenantDb(auth.user.agencyId), auth.user.agencyId, {
        actorId: auth.user.id,
        action: "auth.trusted_devices_revoked",
        entityType: "User",
        entityId: auth.user.id,
        after: { revokedCount: count },
    });
    if (currentId) {
        await destroySession();
        redirect("/login");
    }
    revalidatePath("/settings/security");
}
