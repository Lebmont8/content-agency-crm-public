-- Durable, replay-safe inbound event queue. Provider payload is persisted
-- before domain processing; provider event ids deduplicate redelivery.
BEGIN;

CREATE TYPE "InboundEventStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'PROCESSED', 'RETRY', 'DLQ'
);

CREATE TABLE "InboundEvent" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" "InboundEventStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundEvent_connectionId_providerEventId_key"
  ON "InboundEvent"("connectionId", "providerEventId");
CREATE UNIQUE INDEX "InboundEvent_agencyId_id_key"
  ON "InboundEvent"("agencyId", "id");
CREATE INDEX "InboundEvent_agencyId_status_nextAttemptAt_idx"
  ON "InboundEvent"("agencyId", "status", "nextAttemptAt");
CREATE INDEX "InboundEvent_status_nextAttemptAt_idx"
  ON "InboundEvent"("status", "nextAttemptAt");
CREATE INDEX "InboundEvent_leaseUntil_idx"
  ON "InboundEvent"("leaseUntil");

ALTER TABLE "InboundEvent" ADD CONSTRAINT "InboundEvent_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundEvent" ADD CONSTRAINT "InboundEvent_agencyId_connectionId_fkey"
  FOREIGN KEY ("agencyId", "connectionId")
  REFERENCES "PlatformConnection"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
