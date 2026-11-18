import { describe, expect, it } from "vitest";
import {
  configuredPublicHost,
  shouldRedirectToHttps,
} from "@/lib/https-redirect";

const base = {
  nodeEnv: "production",
  requestProtocol: "http:",
  forwardedProto: null,
  forwardedHost: null,
  host: "app.example.invalid",
};

describe("HTTPS redirect policy", () => {
  it("redirects the public production host when Cloudflare reports HTTP", () => {
    expect(
      shouldRedirectToHttps({
        ...base,
        forwardedProto: "http",
        forwardedHost: "app.example.invalid",
      })
    ).toBe(true);
  });

  it("keeps HTTPS requests unchanged", () => {
    expect(shouldRedirectToHttps({ ...base, forwardedProto: "https" })).toBe(false);
  });

  it("does not redirect loopback health probes", () => {
    expect(shouldRedirectToHttps({ ...base, host: "127.0.0.1:3000" })).toBe(false);
  });

  it("does not enforce the production redirect in development", () => {
    expect(shouldRedirectToHttps({ ...base, nodeEnv: "development" })).toBe(false);
  });

  it("supports an explicitly configured public host", () => {
    expect(
      shouldRedirectToHttps({
        ...base,
        host: "crm.example.com",
        publicHost: "crm.example.com",
      })
    ).toBe(true);
    expect(configuredPublicHost("crm.example.com:443")).toBe("crm.example.com");
  });
});
