-- Durable, tenant-scoped follow-up scheduling with bounded retries and leases.
BEGIN;

CREATE TYPE "FollowUpJobStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'CANCELED', 'DLQ'
);

CREATE TABLE "FollowUpJob" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "creatorAccountId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "sourceAgentRunId" TEXT NOT NULL,
  "sourceAgentActionId" TEXT NOT NULL,
  "agentActionId" TEXT,
  "sequence" INTEGER NOT NULL,
  "runAt" TIMESTAMP(3) NOT NULL,
  "status" "FollowUpJobStatus" NOT NULL DEFAULT 'PENDING',
  "dedupeKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "cancelReason" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FollowUpJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FollowUpJob_sequence_check" CHECK ("sequence" >= 1 AND "sequence" <= 5),
  CONSTRAINT "FollowUpJob_attempts_check" CHECK (
    "attemptCount" >= 0 AND "maxAttempts" >= 1 AND "attemptCount" <= "maxAttempts"
  )
);

CREATE UNIQUE INDEX "FollowUpJob_agencyId_id_key"
  ON "FollowUpJob"("agencyId", "id");
CREATE UNIQUE INDEX "FollowUpJob_agencyId_dedupeKey_key"
  ON "FollowUpJob"("agencyId", "dedupeKey");
CREATE UNIQUE INDEX "FollowUpJob_agentActionId_key"
  ON "FollowUpJob"("agentActionId");
CREATE UNIQUE INDEX "FollowUpJob_agencyId_agentActionId_key"
  ON "FollowUpJob"("agencyId", "agentActionId");
CREATE INDEX "FollowUpJob_agencyId_status_nextAttemptAt_idx"
  ON "FollowUpJob"("agencyId", "status", "nextAttemptAt");
CREATE INDEX "FollowUpJob_agencyId_conversationId_status_idx"
  ON "FollowUpJob"("agencyId", "conversationId", "status");
CREATE INDEX "FollowUpJob_agencyId_creatorAccountId_status_idx"
  ON "FollowUpJob"("agencyId", "creatorAccountId", "status");
CREATE INDEX "FollowUpJob_leaseUntil_idx" ON "FollowUpJob"("leaseUntil");

ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_agencyId_conversationId_fkey"
  FOREIGN KEY ("agencyId", "conversationId") REFERENCES "Conversation"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_agencyId_sourceAgentRunId_fkey"
  FOREIGN KEY ("agencyId", "sourceAgentRunId") REFERENCES "AgentRun"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_agencyId_sourceAgentActionId_fkey"
  FOREIGN KEY ("agencyId", "sourceAgentActionId") REFERENCES "AgentAction"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_agencyId_agentActionId_fkey"
  FOREIGN KEY ("agencyId", "agentActionId") REFERENCES "AgentAction"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
