import { describe, expect, it } from "vitest";
import {
  assertCan,
  can,
  canInviteRole,
  canRemoveUser,
  PermissionError,
  seesAllAccounts,
  type Permission,
} from "@/auth/permissions";

// Mirrors the capability table from the spec/README, row by row.
const TABLE: Array<[Permission, boolean, boolean, boolean]> = [
  //  permission            OWNER  MANAGER CHATTER
  ["billing.manage",        true,  false,  false],
  ["users.manage",          true,  true,   false],
  ["finance.viewAgency",    true,  true,   false],
  ["kpi.viewAll",           true,  true,   false],
  ["kpi.viewOwn",           true,  true,   true],
  ["assignments.manage",    true,  true,   false],
  ["inbox.work",            true,  true,   true],
  ["fans.edit",             true,  true,   true],
  ["vault.manage",          true,  true,   false],
  ["vault.send",            true,  true,   true],
  ["sales.configure",       true,  true,   false],
  ["audit.view",            true,  true,   false],
];

describe("permission matrix", () => {
  for (const [perm, owner, manager, chatter] of TABLE) {
    it(`${perm}: OWNER=${owner} MANAGER=${manager} CHATTER=${chatter}`, () => {
      expect(can("OWNER", perm)).toBe(owner);
      expect(can("MANAGER", perm)).toBe(manager);
      expect(can("CHATTER", perm)).toBe(chatter);
    });
  }
});

describe("invitation constraints", () => {
  it("OWNER invites any role", () => {
    expect(canInviteRole("OWNER", "OWNER")).toBe(true);
    expect(canInviteRole("OWNER", "MANAGER")).toBe(true);
    expect(canInviteRole("OWNER", "CHATTER")).toBe(true);
  });
  it("MANAGER invites only chatters", () => {
    expect(canInviteRole("MANAGER", "CHATTER")).toBe(true);
    expect(canInviteRole("MANAGER", "MANAGER")).toBe(false);
    expect(canInviteRole("MANAGER", "OWNER")).toBe(false);
  });
  it("CHATTER invites nobody", () => {
    expect(canInviteRole("CHATTER", "CHATTER")).toBe(false);
  });
  it("nobody removes an OWNER", () => {
    expect(canRemoveUser("OWNER", "OWNER")).toBe(false);
    expect(canRemoveUser("MANAGER", "OWNER")).toBe(false);
  });
  it("MANAGER removes only chatters", () => {
    expect(canRemoveUser("MANAGER", "CHATTER")).toBe(true);
    expect(canRemoveUser("MANAGER", "MANAGER")).toBe(false);
  });
});

describe("account visibility", () => {
  it("only OWNER sees all accounts; MANAGER/CHATTER require assignment", () => {
    expect(seesAllAccounts("OWNER")).toBe(true);
    expect(seesAllAccounts("MANAGER")).toBe(false);
    expect(seesAllAccounts("CHATTER")).toBe(false);
  });
});

describe("assertCan", () => {
  it("throws PermissionError on denial", () => {
    expect(() => assertCan("CHATTER", "billing.manage")).toThrow(PermissionError);
    expect(() => assertCan("OWNER", "billing.manage")).not.toThrow();
  });
});
