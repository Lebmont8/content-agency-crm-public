// Proves the real Prisma client extension injects the tenant filter.
// A "capture" extension is appended AFTER the tenant extension, so it sees
// exactly the args the database would receive — and short-circuits before
// any connection is attempted (no Postgres needed for this test).

import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/test_never_connects";

const { getTenantDb } = await import("@/lib/tenant-db");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let captured: { model?: string; operation?: string; args?: any } = {};

function withCapture(agencyId: string) {
  return getTenantDb(agencyId).$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args }) {
          captured = { model, operation, args };
          // Short-circuit: never reach the engine.
          if (operation === "findMany") return Promise.resolve([]);
          if (operation === "count") return Promise.resolve(0);
          return Promise.resolve(null);
        },
      },
    },
  });
}

describe("getTenantDb — end-to-end arg injection through Prisma $extends", () => {
  beforeEach(() => {
    captured = {};
  });

  it("agency A's client cannot list agency B's fans", async () => {
    const dbA = withCapture("agency_A");
    await dbA.fan.findMany({ where: { agencyId: "agency_B" } });
    expect(captured.model).toBe("Fan");
    expect(captured.args.where.agencyId).toBe("agency_A");
  });

  it("agency A's client cannot fetch agency B's row by id", async () => {
    const dbA = withCapture("agency_A");
    await dbA.transaction.findMany({ where: { id: "tx_belonging_to_B" } });
    expect(captured.args.where).toEqual({
      id: "tx_belonging_to_B",
      agencyId: "agency_A",
    });
  });

  it("creates are stamped with the caller's agencyId", async () => {
    const dbA = withCapture("agency_A");
    await dbA.fanNote.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { fanId: "f1", authorId: "u1", body: "note", agencyId: "agency_B" } as any,
    });
    expect(captured.args.data.agencyId).toBe("agency_A");
  });

  it("two tenants get independent clients", async () => {
    const dbA = withCapture("agency_A");
    const dbB = withCapture("agency_B");
    await dbA.fan.findMany();
    expect(captured.args.where.agencyId).toBe("agency_A");
    await dbB.fan.findMany();
    expect(captured.args.where.agencyId).toBe("agency_B");
  });

  it("session table is unreachable through the tenant client", async () => {
    const dbA = withCapture("agency_A");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect((dbA as any).session.findMany()).rejects.toThrow(
      /not accessible/
    );
  });
});
