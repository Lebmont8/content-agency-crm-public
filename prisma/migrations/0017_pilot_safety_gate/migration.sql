-- Fail-closed controls for the first real-platform / real-LLM pilot.
BEGIN;

CREATE TYPE "PilotMode" AS ENUM ('OFF', 'SHADOW', 'ASSIST', 'AUTO');

ALTER TABLE "Agency"
  ADD COLUMN "pilotEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CreatorAccount"
  ADD COLUMN "pilotMode" "PilotMode" NOT NULL DEFAULT 'OFF',
  ADD COLUMN "complianceApprovedAt" TIMESTAMP(3),
  ADD COLUMN "dailyAiRunLimit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dailyAiCostLimitMicros" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "CreatorAccount_dailyAiRunLimit_check"
    CHECK ("dailyAiRunLimit" >= 0),
  ADD CONSTRAINT "CreatorAccount_dailyAiCostLimitMicros_check"
    CHECK ("dailyAiCostLimitMicros" >= 0);

CREATE INDEX "CreatorAccount_agencyId_pilotMode_idx"
  ON "CreatorAccount"("agencyId", "pilotMode");

CREATE TABLE "AiUsageDaily" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "creatorAccountId" TEXT NOT NULL,
  "usageDate" DATE NOT NULL,
  "runCount" INTEGER NOT NULL DEFAULT 0,
  "costMicros" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiUsageDaily_runCount_check" CHECK ("runCount" >= 0),
  CONSTRAINT "AiUsageDaily_costMicros_check" CHECK ("costMicros" >= 0)
);

CREATE UNIQUE INDEX "AiUsageDaily_agencyId_creatorAccountId_usageDate_key"
  ON "AiUsageDaily"("agencyId", "creatorAccountId", "usageDate");
CREATE INDEX "AiUsageDaily_agencyId_usageDate_idx"
  ON "AiUsageDaily"("agencyId", "usageDate");

ALTER TABLE "AiUsageDaily"
  ADD CONSTRAINT "AiUsageDaily_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsageDaily"
  ADD CONSTRAINT "AiUsageDaily_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId")
  REFERENCES "CreatorAccount"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
