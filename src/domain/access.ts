import type { Role } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import { seesAllAccounts, PermissionError } from "@/auth/permissions";
export type AuthUser = {
    id: string;
    role: Role;
};
export async function getAccessibleAccounts(tdb: TenantDb, user: AuthUser, opts: {
    includeInactive?: boolean;
} = {}) {
    const activatedFilter = opts.includeInactive ? {} : { activated: true };
    if (seesAllAccounts(user.role)) {
        return tdb.creatorAccount.findMany({
            where: activatedFilter,
            orderBy: { displayName: "asc" },
        });
    }
    const assignments = await tdb.chatterAssignment.findMany({
        where: { userId: user.id, creatorAccount: activatedFilter },
        include: { creatorAccount: true },
    });
    return assignments
        .map((a) => a.creatorAccount)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
export async function getAccessibleAccountIds(tdb: TenantDb, user: AuthUser): Promise<string[]> {
    const accounts = await getAccessibleAccounts(tdb, user);
    return accounts.map((a) => a.id);
}
export async function assertAccountAccess(tdb: TenantDb, user: AuthUser, creatorAccountId: string): Promise<void> {
    if (seesAllAccounts(user.role)) {
        const account = await tdb.creatorAccount.findUnique({
            where: { id: creatorAccountId },
        });
        if (!account)
            throw new PermissionError("Account not found");
        return;
    }
    const assignment = await tdb.chatterAssignment.findFirst({
        where: { userId: user.id, creatorAccountId },
    });
    if (!assignment) {
        throw new PermissionError("You are not assigned to this account");
    }
}
