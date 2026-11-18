-- E0.9: durable human handoff/takeover/resume state and in-app notifications.

BEGIN;

CREATE TYPE "HandoffStatus" AS ENUM ('REQUESTED', 'TAKEN_OVER');
CREATE TYPE "InternalNotificationType" AS ENUM (
  'HANDOFF_REQUESTED',
  'HANDOFF_TAKEN_OVER',
  'HANDOFF_RESUMED'
);

ALTER TABLE "Conversation"
  ADD COLUMN "handoffStatus" "HandoffStatus",
  ADD COLUMN "handoffRequestId" TEXT,
  ADD COLUMN "handoffRequestedAt" TIMESTAMP(3),
  ADD COLUMN "handoffSlaDueAt" TIMESTAMP(3),
  ADD COLUMN "handoffRequestedByUserId" TEXT,
  ADD COLUMN "resumeSalesStage" "SalesStage";

CREATE TABLE "InternalNotification" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "type" "InternalNotificationType" NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "reason" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InternalNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_agencyId_handoffRequestId_key"
  ON "Conversation"("agencyId", "handoffRequestId");
CREATE INDEX "Conversation_agencyId_handoffStatus_handoffSlaDueAt_idx"
  ON "Conversation"("agencyId", "handoffStatus", "handoffSlaDueAt");

CREATE UNIQUE INDEX "InternalNotification_agencyId_id_key"
  ON "InternalNotification"("agencyId", "id");
CREATE UNIQUE INDEX "InternalNotification_agencyId_dedupeKey_key"
  ON "InternalNotification"("agencyId", "dedupeKey");
CREATE INDEX "InternalNotification_agencyId_recipientUserId_readAt_createdAt_idx"
  ON "InternalNotification"("agencyId", "recipientUserId", "readAt", "createdAt");
CREATE INDEX "InternalNotification_agencyId_conversationId_createdAt_idx"
  ON "InternalNotification"("agencyId", "conversationId", "createdAt");

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_agencyId_handoffRequestedByUserId_fkey"
  FOREIGN KEY ("agencyId", "handoffRequestedByUserId")
  REFERENCES "User"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InternalNotification"
  ADD CONSTRAINT "InternalNotification_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalNotification"
  ADD CONSTRAINT "InternalNotification_agencyId_recipientUserId_fkey"
  FOREIGN KEY ("agencyId", "recipientUserId")
  REFERENCES "User"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalNotification"
  ADD CONSTRAINT "InternalNotification_agencyId_conversationId_fkey"
  FOREIGN KEY ("agencyId", "conversationId")
  REFERENCES "Conversation"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
