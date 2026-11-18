import { describe, expect, it } from "vitest";
import {
  guardArgs,
  TENANT_MODELS,
  TenantIsolationError,
} from "@/lib/tenant-guard";

const A = "agency_A";
const B = "agency_B";

describe("guardArgs — tenant isolation", () => {
  it("scopes findMany with no where to the agency", () => {
    const out = guardArgs("Fan", "findMany", undefined, A);
    expect(out.where).toEqual({ agencyId: A });
  });

  it("preserves the caller's filters while forcing agencyId", () => {
    const out = guardArgs(
      "Fan",
      "findMany",
      { where: { username: "whale42" }, take: 10 },
      A
    );
    expect(out.where).toEqual({ username: "whale42", agencyId: A });
    expect(out.take).toBe(10);
  });

  it("overrides a spoofed agencyId in where (agency B data stays unreachable)", () => {
    const out = guardArgs("Fan", "findMany", { where: { agencyId: B } }, A);
    expect(out.where.agencyId).toBe(A);
  });

  it("cannot widen scope via OR blocks — top-level agencyId still ANDs", () => {
    const out = guardArgs(
      "Fan",
      "findMany",
      { where: { OR: [{ agencyId: B }, { username: "x" }] } },
      A
    );
    // Top-level agencyId is ANDed with the OR block by Prisma semantics,
    // so rows from agency B can never be returned.
    expect(out.where.agencyId).toBe(A);
    expect(out.where.OR).toEqual([{ agencyId: B }, { username: "x" }]);
  });

  it("scopes findUnique by id — reading another tenant's row by id fails", () => {
    const out = guardArgs("Fan", "findUnique", { where: { id: "fan_of_B" } }, A);
    expect(out.where).toEqual({ id: "fan_of_B", agencyId: A });
  });

  it("scopes update/delete so cross-tenant writes match zero rows", () => {
    for (const op of ["update", "delete", "updateMany", "deleteMany"]) {
      const out = guardArgs("Fan", op, { where: { id: "fan_of_B" } }, A);
      expect(out.where.agencyId).toBe(A);
    }
  });

  it("forces agencyId on create, ignoring a spoofed value", () => {
    const out = guardArgs(
      "Fan",
      "create",
      { data: { username: "x", agencyId: B } },
      A
    );
    expect(out.data.agencyId).toBe(A);
  });

  it("pins a hostile cross-tenant relation create to the caller tenant", () => {
    const out = guardArgs(
      "Message",
      "create",
      {
        data: {
          agencyId: B,
          conversationId: "conversation_of_B",
          body: "hostile",
        },
      },
      A
    );
    expect(out.data).toMatchObject({
      agencyId: A,
      conversationId: "conversation_of_B",
    });
    // The DAL prevents spoofing agencyId; migration 0005's composite FK then
    // rejects conversation_of_B because it has no (agency_A, id) parent.
  });

  it("forces agencyId on every createMany row", () => {
    const out = guardArgs(
      "Message",
      "createMany",
      { data: [{ body: "hi", agencyId: B }, { body: "yo" }] },
      A
    );
    for (const row of out.data) expect(row.agencyId).toBe(A);
  });

  it("guards upsert on all three parts (where / create / update)", () => {
    const out = guardArgs(
      "Fan",
      "upsert",
      {
        where: { id: "f1" },
        create: { username: "x", agencyId: B },
        update: { agencyId: B, displayName: "new" },
      },
      A
    );
    expect(out.where.agencyId).toBe(A);
    expect(out.create.agencyId).toBe(A);
    expect(out.update).toEqual({ displayName: "new" });
  });

  it("strips agencyId from update data — rows cannot be re-parented", () => {
    const out = guardArgs(
      "Fan",
      "update",
      { where: { id: "f1" }, data: { agencyId: B, displayName: "n" } },
      A
    );
    expect(out.data).toEqual({ displayName: "n" });
  });

  it("scopes aggregations (count / aggregate / groupBy)", () => {
    for (const op of ["count", "aggregate", "groupBy"]) {
      const out = guardArgs("Transaction", op, {}, A);
      expect(out.where.agencyId).toBe(A);
    }
  });

  it("refuses to touch pre-auth models (auth-layer only)", () => {
    for (const model of ["Session", "LoginThrottle", "MfaChallenge"]) {
      expect(() => guardArgs(model, "findMany", {}, A)).toThrow(
        TenantIsolationError
      );
    }
  });

  it("refuses unknown models rather than passing them through unscoped", () => {
    expect(() => guardArgs("SomeNewModel", "findMany", {}, A)).toThrow(
      TenantIsolationError
    );
  });

  it("refuses an empty agencyId", () => {
    expect(() => guardArgs("Fan", "findMany", {}, "")).toThrow(
      TenantIsolationError
    );
  });

  it("allows audit inserts and reads but rejects every mutation", () => {
    expect(() =>
      guardArgs("AuditLog", "create", { data: { action: "test" } }, A)
    ).not.toThrow();
    expect(() => guardArgs("AuditLog", "findMany", {}, A)).not.toThrow();
    for (const operation of [
      "update",
      "updateMany",
      "upsert",
      "delete",
      "deleteMany",
    ]) {
      expect(() => guardArgs("AuditLog", operation, {}, A)).toThrow(
        /append-only/
      );
    }
  });

  describe("Agency model special-casing", () => {
    it("read is pinned to the caller's own agency", () => {
      const out = guardArgs("Agency", "findUnique", { where: { id: B } }, A);
      expect(out.where.id).toBe(A);
    });

    it("update is pinned and cannot change id", () => {
      const out = guardArgs(
        "Agency",
        "update",
        { where: { id: B }, data: { id: B, name: "New name" } },
        A
      );
      expect(out.where.id).toBe(A);
      expect(out.data).toEqual({ name: "New name" });
    });

    it("create/delete of agencies is forbidden via tenant client", () => {
      expect(() => guardArgs("Agency", "create", { data: {} }, A)).toThrow(
        TenantIsolationError
      );
      expect(() => guardArgs("Agency", "delete", { where: { id: A } }, A)).toThrow(
        TenantIsolationError
      );
    });
  });

  it("covers every domain model in the registry", () => {
    // Regression guard: if a new Prisma model is added, it must be classified
    // (tenant-scoped, forbidden, or special-cased) or all queries throw.
    const expected = [
      "User",
      "Invitation",
      "UserMfaCredential",
      "MfaRecoveryCode",
      "TrustedDevice",
      "CreatorAccount",
      "CreatorSalesProfile",
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
      "OutboundDelivery",
      "OutboundDeliveryAttempt",
      "AuditLog",
      "SaasSubscription",
      "BillingRecord",
    ];
    for (const m of expected) expect(TENANT_MODELS.has(m)).toBe(true);
  });
});
