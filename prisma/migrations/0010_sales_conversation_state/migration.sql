-- Additive sales-state foundation for the AI sales lifecycle. Existing
-- conversations remain HUMAN/NEW until a later orchestrator advances them.
BEGIN;

CREATE TYPE "SalesStage" AS ENUM (
  'NEW',
  'DISCOVERY',
  'QUALIFIED',
  'WARMING',
  'OFFERED',
  'OBJECTION',
  'CLOSING',
  'WON',
  'HANDOFF',
  'PAUSED',
  'LOST'
);

CREATE TYPE "ControlMode" AS ENUM ('HUMAN', 'ASSIST', 'AUTO');

ALTER TABLE "Fan"
  ADD COLUMN "contactOptOutAt" TIMESTAMP(3),
  ADD COLUMN "contactOptOutReason" TEXT;

ALTER TABLE "Conversation"
  ADD COLUMN "controlMode" "ControlMode" NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN "salesStage" "SalesStage" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "memorySummary" TEXT,
  ADD COLUMN "intent" TEXT,
  ADD COLUMN "budgetCents" INTEGER,
  ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "objections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "promises" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "nextActionAt" TIMESTAMP(3),
  ADD COLUMN "handoffReason" TEXT,
  ADD COLUMN "assignedUserId" TEXT,
  ADD COLUMN "takenOverAt" TIMESTAMP(3),
  ADD COLUMN "resumeMode" "ControlMode",
  ADD CONSTRAINT "Conversation_budgetCents_nonnegative"
    CHECK ("budgetCents" IS NULL OR "budgetCents" >= 0);

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_agencyId_assignedUserId_fkey"
  FOREIGN KEY ("agencyId", "assignedUserId")
  REFERENCES "User"("agencyId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Conversation_agencyId_salesStage_nextActionAt_idx"
  ON "Conversation"("agencyId", "salesStage", "nextActionAt");
CREATE INDEX "Conversation_agencyId_assignedUserId_idx"
  ON "Conversation"("agencyId", "assignedUserId");

COMMIT;
