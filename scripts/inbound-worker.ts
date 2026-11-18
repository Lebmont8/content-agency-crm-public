import { setTimeout as delay } from "node:timers/promises";
import { db } from "../src/lib/db";
import { getTenantDb } from "../src/lib/tenant-db";
import { processDueInboundEvents } from "../src/inbound/processor";

const pollMs = Number(process.env.INBOUND_POLL_MS ?? 2_000);

async function tick(): Promise<number> {
  const agencies = await db.agency.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  let processed = 0;
  for (const agency of agencies) {
    processed += await processDueInboundEvents(
      getTenantDb(agency.id),
      agency.id
    );
  }
  return processed;
}

async function main(): Promise<void> {
  if (process.argv.includes("--once")) {
    await tick();
    return;
  }
  while (true) {
    const processed = await tick();
    if (processed === 0) await delay(pollMs);
  }
}

main()
  .catch((error) => {
    console.error(
      "Inbound worker stopped",
      error instanceof Error ? error.name : "error"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.argv.includes("--once")) await db.$disconnect();
  });
