import { setTimeout as delay } from "node:timers/promises";
import { db } from "../src/lib/db";
import { getTenantDb } from "../src/lib/tenant-db";
import { processDueNotificationDeliveries } from "../src/notifications/worker";
import { emitBillingNotifications } from "../src/billing/notifications";
import { verifySubmittedCryptoPayments } from "../src/billing/verifier";

const pollMs = Number(process.env.NOTIFICATION_POLL_MS ?? 2_000);

async function tick(): Promise<number> {
  const agencies = await db.agency.findMany({ select: { id: true } });
  let processed = 0;
  for (const agency of agencies) {
    const tdb = getTenantDb(agency.id);
    processed += await verifySubmittedCryptoPayments(tdb, agency.id);
    processed += await emitBillingNotifications(tdb, agency.id);
    processed += await processDueNotificationDeliveries(tdb, agency.id);
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
    console.error("Notification worker stopped", error instanceof Error ? error.name : "error");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.argv.includes("--once")) await db.$disconnect();
  });
