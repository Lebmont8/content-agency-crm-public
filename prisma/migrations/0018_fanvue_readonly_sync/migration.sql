-- E1.1: restart-safe, observable read-only provider synchronization.
-- Nullable columns make this forward-only migration safe for existing rows.
ALTER TABLE "PlatformConnection"
  ADD COLUMN "lastSyncStartedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "syncLeaseOwner" TEXT,
  ADD COLUMN "syncLeaseUntil" TIMESTAMP(3);

CREATE INDEX "PlatformConnection_agencyId_status_syncLeaseUntil_idx"
  ON "PlatformConnection"("agencyId", "status", "syncLeaseUntil");
