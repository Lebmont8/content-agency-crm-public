-- Durable causal attribution for AI decisions, proposed actions, deliveries
-- and sales. All new rows remain tenant-scoped through composite foreign keys.
BEGIN;

CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "AgentActionKind" AS ENUM (
  'SELECT_OFFER', 'SEND_TEXT', 'SEND_PPV', 'CHECK_PURCHASE',
  'UPDATE_SALES_STATE', 'SCHEDULE_FOLLOW_UP', 'CANCEL_FOLLOW_UP',
  'HANDOFF_TO_HUMAN'
);
CREATE TYPE "AgentActionStatus" AS ENUM (
  'PROPOSED', 'APPROVED', 'EXECUTING', 'COMPLETED', 'DENIED', 'FAILED', 'CANCELED'
);
CREATE TYPE "SalesEventType" AS ENUM (
  'STAGE_CHANGED', 'OFFER_SELECTED', 'OFFER_SENT', 'OBJECTION_RECORDED',
  'HANDOFF', 'PURCHASED', 'LOST'
);

CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "inboundEventId" TEXT NOT NULL,
  "triggerMessageId" TEXT,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
  "decision" JSONB,
  "errorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentAction" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "agentRunId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "kind" "AgentActionKind" NOT NULL,
  "status" "AgentActionStatus" NOT NULL DEFAULT 'PROPOSED',
  "input" JSONB,
  "result" JSONB,
  "reasonCode" TEXT,
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesEvent" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "agentRunId" TEXT,
  "agentActionId" TEXT,
  "type" "SalesEventType" NOT NULL,
  "stageFrom" "SalesStage",
  "stageTo" "SalesStage",
  "metadata" JSONB,
  "dedupeKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Message" ADD COLUMN "originAgentActionId" TEXT;
ALTER TABLE "VaultSend" ADD COLUMN "originAgentActionId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "originAgentActionId" TEXT;

CREATE UNIQUE INDEX "AgentRun_agencyId_id_key" ON "AgentRun"("agencyId", "id");
CREATE UNIQUE INDEX "AgentRun_agencyId_inboundEventId_key" ON "AgentRun"("agencyId", "inboundEventId");
CREATE INDEX "AgentRun_agencyId_conversationId_createdAt_idx" ON "AgentRun"("agencyId", "conversationId", "createdAt");
CREATE INDEX "AgentRun_agencyId_status_createdAt_idx" ON "AgentRun"("agencyId", "status", "createdAt");

CREATE UNIQUE INDEX "AgentAction_agencyId_id_key" ON "AgentAction"("agencyId", "id");
CREATE UNIQUE INDEX "AgentAction_agencyId_clientRequestId_key" ON "AgentAction"("agencyId", "clientRequestId");
CREATE INDEX "AgentAction_agencyId_agentRunId_createdAt_idx" ON "AgentAction"("agencyId", "agentRunId", "createdAt");
CREATE INDEX "AgentAction_agencyId_conversationId_status_idx" ON "AgentAction"("agencyId", "conversationId", "status");

CREATE UNIQUE INDEX "SalesEvent_agencyId_id_key" ON "SalesEvent"("agencyId", "id");
CREATE UNIQUE INDEX "SalesEvent_agencyId_dedupeKey_key" ON "SalesEvent"("agencyId", "dedupeKey");
CREATE INDEX "SalesEvent_agencyId_conversationId_occurredAt_idx" ON "SalesEvent"("agencyId", "conversationId", "occurredAt");
CREATE INDEX "SalesEvent_agencyId_type_occurredAt_idx" ON "SalesEvent"("agencyId", "type", "occurredAt");

CREATE UNIQUE INDEX "Message_originAgentActionId_key" ON "Message"("originAgentActionId");
CREATE UNIQUE INDEX "Message_agencyId_originAgentActionId_key" ON "Message"("agencyId", "originAgentActionId");
CREATE UNIQUE INDEX "VaultSend_originAgentActionId_key" ON "VaultSend"("originAgentActionId");
CREATE UNIQUE INDEX "VaultSend_agencyId_originAgentActionId_key" ON "VaultSend"("agencyId", "originAgentActionId");
CREATE UNIQUE INDEX "Transaction_originAgentActionId_key" ON "Transaction"("originAgentActionId");
CREATE UNIQUE INDEX "Transaction_agencyId_originAgentActionId_key" ON "Transaction"("agencyId", "originAgentActionId");

ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agencyId_conversationId_fkey"
  FOREIGN KEY ("agencyId", "conversationId") REFERENCES "Conversation"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agencyId_inboundEventId_fkey"
  FOREIGN KEY ("agencyId", "inboundEventId") REFERENCES "InboundEvent"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agencyId_triggerMessageId_fkey"
  FOREIGN KEY ("agencyId", "triggerMessageId") REFERENCES "Message"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_agencyId_agentRunId_fkey"
  FOREIGN KEY ("agencyId", "agentRunId") REFERENCES "AgentRun"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_agencyId_conversationId_fkey"
  FOREIGN KEY ("agencyId", "conversationId") REFERENCES "Conversation"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesEvent" ADD CONSTRAINT "SalesEvent_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesEvent" ADD CONSTRAINT "SalesEvent_agencyId_conversationId_fkey"
  FOREIGN KEY ("agencyId", "conversationId") REFERENCES "Conversation"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesEvent" ADD CONSTRAINT "SalesEvent_agencyId_agentRunId_fkey"
  FOREIGN KEY ("agencyId", "agentRunId") REFERENCES "AgentRun"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesEvent" ADD CONSTRAINT "SalesEvent_agencyId_agentActionId_fkey"
  FOREIGN KEY ("agencyId", "agentActionId") REFERENCES "AgentAction"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_agencyId_originAgentActionId_fkey"
  FOREIGN KEY ("agencyId", "originAgentActionId") REFERENCES "AgentAction"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VaultSend" ADD CONSTRAINT "VaultSend_agencyId_originAgentActionId_fkey"
  FOREIGN KEY ("agencyId", "originAgentActionId") REFERENCES "AgentAction"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_agencyId_originAgentActionId_fkey"
  FOREIGN KEY ("agencyId", "originAgentActionId") REFERENCES "AgentAction"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
