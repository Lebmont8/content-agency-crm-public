// Tenant-scoped data access. getTenantDb(agencyId) returns a Prisma client
// whose every query is transparently constrained to that agency via
// guardArgs(). This is the ONLY sanctioned way to touch domain data from
// route handlers, server actions and pages.

import { db } from "@/lib/db";
import { guardArgs } from "@/lib/tenant-guard";

function buildTenantDb(agencyId: string) {
  return db.$extends({
    name: `tenant:${agencyId}`,
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return query(guardArgs(model, operation, args as any, agencyId) as any);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof buildTenantDb>;

const cache = new Map<string, TenantDb>();

export function getTenantDb(agencyId: string): TenantDb {
  let client = cache.get(agencyId);
  if (!client) {
    client = buildTenantDb(agencyId);
    cache.set(agencyId, client);
  }
  return client;
}
