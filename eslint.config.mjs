import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "desktop-connector/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  // Tenant isolation: application code must never touch the raw Prisma
  // client. Only the auth layer, the tenant wrapper itself, and scripts may.
  {
    files: ["src/app/**", "src/components/**", "src/domain/**", "src/platform/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Raw Prisma access is forbidden here. Use getTenantDb(agencyId) from @/lib/tenant-db so every query is tenant-scoped.",
            },
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message:
                "Do not instantiate PrismaClient. Use getTenantDb(agencyId) from @/lib/tenant-db.",
            },
          ],
        },
      ],
    },
  },
  // Auth endpoints are the sanctioned cross-tenant boundary (login, register,
  // invitation acceptance operate before/across tenant context).
  {
    files: ["src/app/(auth)/**", "src/app/api/auth/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];

export default eslintConfig;
