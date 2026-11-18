import type { TenantDb } from "@/lib/tenant-db";
import type { Prisma } from "@prisma/client";
export const AUDIT_REDACTED = "[REDACTED]";
const AUDIT_TRUNCATED = "[TRUNCATED]";
const MAX_DEPTH = 6;
const MAX_OBJECT_KEYS = 64;
const MAX_ARRAY_ITEMS = 32;
const MAX_STRING_LENGTH = 512;
const MAX_METADATA_BYTES = 16384;
const SENSITIVE_KEY_PARTS = [
    "password",
    "passwd",
    "secret",
    "token",
    "authorization",
    "cookie",
    "credential",
    "recoverycode",
    "apikey",
    "privatekey",
    "session",
    "totp",
    "otpcode",
    "email",
    "phone",
    "address",
    "username",
    "messagebody",
    "body",
] as const;
function isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}
function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (depth > MAX_DEPTH)
        return AUDIT_TRUNCATED;
    if (value === null || typeof value === "boolean")
        return value;
    if (typeof value === "string") {
        return value.length > MAX_STRING_LENGTH
            ? `${value.slice(0, MAX_STRING_LENGTH)}${AUDIT_TRUNCATED}`
            : value;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : "[INVALID_NUMBER]";
    }
    if (typeof value !== "object")
        return `[UNSUPPORTED_${typeof value}]`;
    if (seen.has(value))
        return "[CIRCULAR]";
    seen.add(value);
    if (Array.isArray(value)) {
        const output = value
            .slice(0, MAX_ARRAY_ITEMS)
            .map((item) => sanitizeValue(item, depth + 1, seen));
        if (value.length > MAX_ARRAY_ITEMS)
            output.push(AUDIT_TRUNCATED);
        return output;
    }
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
        output[key] = isSensitiveKey(key)
            ? AUDIT_REDACTED
            : sanitizeValue(item, depth + 1, seen);
    }
    if (entries.length > MAX_OBJECT_KEYS)
        output.__truncated__ = AUDIT_TRUNCATED;
    return output;
}
export function redactAuditMetadata(value: Prisma.InputJsonValue | undefined): Prisma.InputJsonValue | undefined {
    if (value === undefined)
        return undefined;
    const sanitized = sanitizeValue(value, 0, new WeakSet<object>());
    const bytes = Buffer.byteLength(JSON.stringify(sanitized), "utf8");
    if (bytes > MAX_METADATA_BYTES) {
        return { redacted: "metadata_too_large", originalBytes: bytes };
    }
    return sanitized as Prisma.InputJsonValue;
}
export type AuditAction = "auth.login" | "auth.login_blocked" | "auth.mfa_setup" | "auth.mfa_login" | "auth.mfa_recovery" | "auth.mfa_recovery_regenerated" | "auth.mfa_replaced" | "auth.trusted_device_created" | "auth.trusted_device_used" | "auth.trusted_device_revoked" | "auth.trusted_devices_revoked" | "auth.register" | "user.invite" | "user.deactivate" | "message.send" | "message.enqueue" | "ppv.send" | "ppv.enqueue" | "fan.note.create" | "fan.note.update" | "fan.note.delete" | "fan.tag.add" | "fan.tag.remove" | "fan.tag.create" | "fan.tag.update" | "fan.tag.delete" | "vault.item.create" | "vault.item.price.update" | "vault.item.sales-rules.update" | "vault.price-group.create" | "vault.price-group.update" | "vault.price-group.delete" | "sales.profile.update" | "sales.profile.draft.update" | "sales.profile.publish" | "sales.profile.rollback" | "sales.profile.preview" | "notification.preference.update" | "notification.preference.delete" | "notification.telegram.pairing" | "notification.telegram.disconnect" | "content-request.create" | "content-request.update" | "conversation.handoff.request" | "conversation.takeover" | "conversation.resume" | "mock.purchase.simulate" | "account.create" | "account.status.update" | "platform.connection.authorize" | "platform.connection.sync" | "platform.connection.disconnect" | "connector.device.pairing_created" | "connector.device.paired" | "connector.device.revoked" | "connector.profile.bound" | "connector.snapshot.ingested" | "assignment.add" | "assignment.remove" | "shift.start" | "shift.end" | "billing.invoice.create" | "billing.payment.claim" | "billing.payment.confirm" | "agency.pricing.update" | "agency.status.update" | "agency.pilot.update" | "account.pilot.update" | "account.activate";
export async function logAudit(database: TenantDb | {
    auditLog: unknown;
}, agencyId: string, entry: {
    actorId: string | null;
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
}): Promise<void> {
    const auditLog = database.auditLog as unknown as {
        create(args: {
            data: Prisma.AuditLogUncheckedCreateInput;
        }): Promise<unknown>;
    };
    await auditLog.create({
        data: {
            agencyId,
            actorId: entry.actorId,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId ?? null,
            ...(entry.before === undefined
                ? {}
                : { before: redactAuditMetadata(entry.before) }),
            ...(entry.after === undefined
                ? {}
                : { after: redactAuditMetadata(entry.after) }),
        },
    });
}
