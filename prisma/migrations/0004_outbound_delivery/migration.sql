-- Durable outbound delivery queue. Message/PPV rows are committed before any
-- network call; delivery attempts never store message bodies or credentials.
CREATE TYPE "OutboundDeliveryKind" AS ENUM ('TEXT', 'PPV');
CREATE TYPE "OutboundDeliveryStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'CONFIRMING', 'SENT', 'RETRY', 'FAILED', 'DLQ', 'CANCELED'
);
CREATE TYPE "OutboundAttemptOutcome" AS ENUM (
  'SENT', 'RETRYABLE', 'PERMANENT', 'AMBIGUOUS'
);

CREATE UNIQUE INDEX "Fan_agencyId_id_key" ON "Fan"("agencyId", "id");
CREATE UNIQUE INDEX "Conversation_agencyId_id_key" ON "Conversation"("agencyId", "id");
CREATE UNIQUE INDEX "Message_agencyId_id_key" ON "Message"("agencyId", "id");
CREATE UNIQUE INDEX "VaultSend_agencyId_id_key" ON "VaultSend"("agencyId", "id");

CREATE TABLE "OutboundDelivery" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "creatorAccountId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "fanId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "vaultSendId" TEXT,
  "clientRequestId" TEXT NOT NULL,
  "kind" "OutboundDeliveryKind" NOT NULL,
  "status" "OutboundDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "providerExternalRef" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboundDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboundDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "outcome" "OutboundAttemptOutcome" NOT NULL,
  "errorCode" TEXT,
  "httpStatus" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboundDelivery_messageId_key" ON "OutboundDelivery"("messageId");
CREATE UNIQUE INDEX "OutboundDelivery_vaultSendId_key" ON "OutboundDelivery"("vaultSendId");
CREATE UNIQUE INDEX "OutboundDelivery_agencyId_id_key" ON "OutboundDelivery"("agencyId", "id");
CREATE UNIQUE INDEX "OutboundDelivery_agencyId_clientRequestId_key" ON "OutboundDelivery"("agencyId", "clientRequestId");
CREATE UNIQUE INDEX "OutboundDelivery_agencyId_messageId_key" ON "OutboundDelivery"("agencyId", "messageId");
CREATE UNIQUE INDEX "OutboundDelivery_agencyId_vaultSendId_key" ON "OutboundDelivery"("agencyId", "vaultSendId");
CREATE INDEX "OutboundDelivery_agencyId_status_nextAttemptAt_idx" ON "OutboundDelivery"("agencyId", "status", "nextAttemptAt");
CREATE INDEX "OutboundDelivery_status_nextAttemptAt_idx" ON "OutboundDelivery"("status", "nextAttemptAt");
CREATE INDEX "OutboundDelivery_leaseUntil_idx" ON "OutboundDelivery"("leaseUntil");
CREATE UNIQUE INDEX "OutboundDeliveryAttempt_agencyId_deliveryId_number_key" ON "OutboundDeliveryAttempt"("agencyId", "deliveryId", "number");
CREATE INDEX "OutboundDeliveryAttempt_agencyId_finishedAt_idx" ON "OutboundDeliveryAttempt"("agencyId", "finishedAt");

ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_agencyId_connectionId_fkey"
  FOREIGN KEY ("agencyId", "connectionId") REFERENCES "PlatformConnection"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_agencyId_conversationId_fkey"
  FOREIGN KEY ("agencyId", "conversationId") REFERENCES "Conversation"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_agencyId_fanId_fkey"
  FOREIGN KEY ("agencyId", "fanId") REFERENCES "Fan"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_agencyId_messageId_fkey"
  FOREIGN KEY ("agencyId", "messageId") REFERENCES "Message"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_agencyId_vaultSendId_fkey"
  FOREIGN KEY ("agencyId", "vaultSendId") REFERENCES "VaultSend"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDeliveryAttempt" ADD CONSTRAINT "OutboundDeliveryAttempt_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDeliveryAttempt" ADD CONSTRAINT "OutboundDeliveryAttempt_agencyId_deliveryId_fkey"
  FOREIGN KEY ("agencyId", "deliveryId") REFERENCES "OutboundDelivery"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
