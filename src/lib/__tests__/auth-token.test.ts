import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/auth-token";

describe("opaque auth tokens", () => {
  it("creates independent high-entropy URL-safe values", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.length).toBeGreaterThanOrEqual(40);
  });

  it("stores a deterministic SHA-256 digest instead of the raw token", () => {
    const token = "one-time-secret";
    const digest = hashOpaqueToken(token);
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[a-f0-9]+$/);
    expect(digest).not.toContain(token);
    expect(hashOpaqueToken(token)).toBe(digest);
  });
});
