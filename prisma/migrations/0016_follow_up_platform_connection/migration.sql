-- Restore the nullable platform connection captured by follow-up execution.
-- The composite foreign key keeps the relation inside the owning tenant.
BEGIN;

ALTER TABLE "FollowUpJob"
  ADD COLUMN "platformConnectionId" TEXT;

CREATE INDEX "FollowUpJob_agencyId_platformConnectionId_idx"
  ON "FollowUpJob"("agencyId", "platformConnectionId");

ALTER TABLE "FollowUpJob"
  ADD CONSTRAINT "FollowUpJob_agencyId_platformConnectionId_fkey"
  FOREIGN KEY ("agencyId", "platformConnectionId")
  REFERENCES "PlatformConnection"("agencyId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
