import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const distDir = process.env.NEXT_DIST_DIR ?? ".next";
const tsconfigPath =
  process.env.NEXT_TSCONFIG_PATH ?? "tsconfig.json";

if (!/^\.next(?:-[A-Za-z0-9-]+)?$/.test(distDir)) {
  throw new Error(
    "NEXT_DIST_DIR must be .next or a root-level .next-* directory name"
  );
}

if (
  tsconfigPath !== "tsconfig.json" &&
  !/^\.tsconfig-fixture-e2e-[A-Za-z0-9]+\.json$/.test(tsconfigPath)
) {
  throw new Error(
    "NEXT_TSCONFIG_PATH must be tsconfig.json or a root-level fixture E2E config"
  );
}

// Content-Security-Policy. In dev, Next's HMR needs 'unsafe-eval', so a strict
// CSP is applied in production only. 'unsafe-inline' for styles/scripts is a
// pragmatic first step (Next injects inline styles); nonce-based hardening is a
// TODO. The load-bearing directives here are frame-ancestors / object-src /
// base-uri / form-action, which block clickjacking and injection vectors.
const csp = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        { key: "Content-Security-Policy", value: csp },
      ]
    : []),
];

const nextConfig: NextConfig = {
  experimental: { cpus: 1 },
  distDir,
  typescript: {
    tsconfigPath,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
