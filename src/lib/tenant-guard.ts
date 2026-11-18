// Pure tenant-isolation logic: given a Prisma model/operation/args and the
// caller's agencyId, return args that are guaranteed to be scoped to that
// agency. Kept free of Prisma imports so it is trivially unit-testable.

/** Domain models that carry an `agencyId` column and MUST be tenant-scoped. */
export const TENANT_MODELS = new Set<string>([
  "User",
  "Invitation",
  "UserMfaCredential",
  "MfaRecoveryCode",
  "TrustedDevice",
  "CreatorAccount",
  "CreatorSalesProfile",
  "VaultPriceGroup",
  "UserNotificationPreference",
  "ContentRequest",
  "PlatformConnection",
  "PlatformCredential",
  "DesktopConnectorDevice",
  "DesktopConnectorProfile",
  "DesktopConnectorRequest",
  "DesktopConnectorCommand",
  "InboundEvent",
  "AgentRun",
  "AgentAction",
  "SalesEvent",
  "FollowUpJob",
  "InternalNotification",
  "NotificationDelivery",
  "OutboundDelivery",
  "OutboundDeliveryAttempt",
  "ChatterAssignment",
  "Shift",
  "Fan",
  "FanNote",
  "FanTag",
  "FanTagLink",
  "Conversation",
  "Message",
  "Transaction",
  "VaultItem",
  "VaultSend",
  "AuditLog",
  "SaasSubscription",
  "BillingRecord",
  "CryptoPayment",
]);

/** Models the tenant client must never touch (auth layer only). */
export const FORBIDDEN_MODELS = new Set<string>([
  "Session",
  "LoginThrottle",
  "MfaChallenge",
]);

const READ_WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

const WRITE_WHERE_OPS = new Set(["update", "updateMany", "delete", "deleteMany"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = Record<string, any>;

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/**
 * Injects the tenant filter into query args.
 *
 * - Every `where` gets `agencyId` forced to the caller's agency. Because
 *   top-level fields in a Prisma `where` are ANDed with any OR/AND blocks,
 *   a hostile filter like `{ OR: [{ agencyId: "other" }] }` can only narrow
 *   the result set, never widen it.
 * - Every `create`/`upsert.create` gets `data.agencyId` overwritten.
 * - Pre-auth models (`Session`, `LoginThrottle`, `MfaChallenge`) are not
 *   accessible through the tenant client.
 * - `Agency` may only be read/updated as the caller's own row; create/delete
 *   are forbidden.
 */
export function guardArgs(
  model: string,
  operation: string,
  args: AnyArgs | undefined,
  agencyId: string
): AnyArgs {
  if (!agencyId) throw new TenantIsolationError("agencyId is required");
  const a: AnyArgs = { ...(args ?? {}) };

  if (FORBIDDEN_MODELS.has(model)) {
    throw new TenantIsolationError(
      `Model ${model} is not accessible through the tenant client`
    );
  }

  if (model === "Agency") {
    if (READ_WHERE_OPS.has(operation) || operation === "update") {
      a.where = { ...(a.where ?? {}), id: agencyId };
      if (operation === "update" && a.data) {
        // Never allow re-parenting or id changes.
        const { id: _id, ...rest } = a.data;
        a.data = rest;
      }
      return a;
    }
    throw new TenantIsolationError(
      `Operation ${operation} on Agency is not allowed through the tenant client`
    );
  }

  if (!TENANT_MODELS.has(model)) {
    throw new TenantIsolationError(
      `Model ${model} is not registered as tenant-scoped; refusing to query it`
    );
  }

  if (
    model === "AuditLog" &&
    !READ_WHERE_OPS.has(operation) &&
    !["create", "createMany", "createManyAndReturn"].includes(operation)
  ) {
    throw new TenantIsolationError(
      `Operation ${operation} on AuditLog is forbidden: audit rows are append-only`
    );
  }

  if (READ_WHERE_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
    a.where = { ...(a.where ?? {}), agencyId };
  }

  if (operation === "create") {
    a.data = { ...(a.data ?? {}), agencyId };
  }

  if (operation === "createMany" || operation === "createManyAndReturn") {
    const data = a.data ?? [];
    a.data = Array.isArray(data)
      ? data.map((d: AnyArgs) => ({ ...d, agencyId }))
      : { ...data, agencyId };
  }

  if (operation === "upsert") {
    a.where = { ...(a.where ?? {}), agencyId };
    a.create = { ...(a.create ?? {}), agencyId };
    if (a.update) {
      const { agencyId: _drop, ...rest } = a.update;
      a.update = rest;
    }
  }

  if (WRITE_WHERE_OPS.has(operation) || operation === "update") {
    // Prevent moving a row to another tenant via data.agencyId.
    if (a.data && typeof a.data === "object" && !Array.isArray(a.data)) {
      const { agencyId: _drop, ...rest } = a.data;
      a.data = rest;
    }
  }

  return a;
}
