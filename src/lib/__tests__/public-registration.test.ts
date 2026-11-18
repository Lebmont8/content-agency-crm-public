import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPublicRegistrationEnabled } from "@/lib/public-registration";

describe("public registration gate", () => {
  it("fails closed unless the operator explicitly enables it", () => {
    expect(isPublicRegistrationEnabled(undefined)).toBe(false);
    expect(isPublicRegistrationEnabled("")).toBe(false);
    expect(isPublicRegistrationEnabled("1")).toBe(false);
    expect(isPublicRegistrationEnabled("yes")).toBe(false);
    expect(isPublicRegistrationEnabled("true")).toBe(true);
    expect(isPublicRegistrationEnabled(" TRUE ")).toBe(true);
  });

  it("guards the server action before validation or database access", () => {
    const actions = fs.readFileSync(
      path.join(process.cwd(), "src/app/(auth)/actions.ts"),
      "utf8"
    );
    const guard = actions.indexOf("if (!isPublicRegistrationEnabled())");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(
      actions.indexOf("registerSchema.safeParse", guard)
    );
    expect(guard).toBeLessThan(actions.indexOf("db.user.findUnique", guard));
  });

  it("does not advertise public tenant creation from the login screen", () => {
    const login = fs.readFileSync(
      path.join(process.cwd(), "src/app/(auth)/login/page.tsx"),
      "utf8"
    );
    const registerPage = fs.readFileSync(
      path.join(process.cwd(), "src/app/(auth)/register/page.tsx"),
      "utf8"
    );
    expect(login).not.toContain('href="/register"');
    expect(registerPage).toContain("isPublicRegistrationEnabled()");
  });
});
