import type { Role } from "@prisma/client";
export type Permission = "billing.manage" | "users.manage" | "finance.viewAgency" | "kpi.viewAll" | "kpi.viewOwn" | "assignments.manage" | "inbox.work" | "fans.edit" | "vault.manage" | "vault.send" | "sales.configure" | "audit.view";
const ALL: Permission[] = [
    "billing.manage",
    "users.manage",
    "finance.viewAgency",
    "kpi.viewAll",
    "kpi.viewOwn",
    "assignments.manage",
    "inbox.work",
    "fans.edit",
    "vault.manage",
    "vault.send",
    "sales.configure",
    "audit.view",
];
const MATRIX: Record<Role, ReadonlySet<Permission>> = {
    OWNER: new Set<Permission>(ALL),
    MANAGER: new Set<Permission>([
        "users.manage",
        "finance.viewAgency",
        "kpi.viewAll",
        "kpi.viewOwn",
        "assignments.manage",
        "inbox.work",
        "fans.edit",
        "vault.manage",
        "vault.send",
        "sales.configure",
        "audit.view",
    ]),
    CHATTER: new Set<Permission>([
        "kpi.viewOwn",
        "inbox.work",
        "fans.edit",
        "vault.send",
    ]),
};
export function can(role: Role, permission: Permission): boolean {
    return MATRIX[role].has(permission);
}
export function canInviteRole(actor: Role, target: Role): boolean {
    if (actor === "OWNER")
        return true;
    if (actor === "MANAGER")
        return target === "CHATTER";
    return false;
}
export function canRemoveUser(actor: Role, target: Role): boolean {
    if (target === "OWNER")
        return false;
    return canInviteRole(actor, target);
}
export function seesAllAccounts(role: Role): boolean {
    return role === "OWNER";
}
export function assertCan(role: Role, permission: Permission): void {
    if (!can(role, permission)) {
        throw new PermissionError(`Role ${role} lacks permission ${permission}`);
    }
}
export class PermissionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PermissionError";
    }
}
