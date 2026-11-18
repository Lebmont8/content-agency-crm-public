import { describe, expect, it } from "vitest";
import {
  hashLoginIdentifier,
  LOGIN_BLOCK_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  normalizeLoginIdentifier,
} from "@/lib/login-throttle";

describe("login throttle identifiers", () => {
  it("normalizes equivalent email input before hashing", () => {
    expect(normalizeLoginIdentifier("  Owner@Example.COM ")).toBe(
      "owner@example.com"
    );
    expect(hashLoginIdentifier("Owner@Example.COM")).toBe(
      hashLoginIdentifier(" owner@example.com ")
    );
  });

  it("does not persist the raw login identifier", () => {
    const email = "private@example.com";
    const digest = hashLoginIdentifier(email);
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(email);
  });

  it("uses bounded attempt, window and block settings", () => {
    expect(LOGIN_MAX_ATTEMPTS).toBeGreaterThanOrEqual(5);
    expect(LOGIN_WINDOW_MS).toBeGreaterThan(0);
    expect(LOGIN_BLOCK_MS).toBeGreaterThan(0);
  });
});
