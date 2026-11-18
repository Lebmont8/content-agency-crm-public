ALTER TABLE "AgentRun"
  ADD COLUMN "shadowOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "copilotProvider" TEXT,
  ADD COLUMN "copilotModel" TEXT,
  ADD COLUMN "providerRequestId" TEXT,
  ADD COLUMN "llmInputTokens" INTEGER,
  ADD COLUMN "llmOutputTokens" INTEGER,
  ADD COLUMN "reservedCostMicros" INTEGER;

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_llmInputTokens_nonnegative"
    CHECK ("llmInputTokens" IS NULL OR "llmInputTokens" >= 0),
  ADD CONSTRAINT "AgentRun_llmOutputTokens_nonnegative"
    CHECK ("llmOutputTokens" IS NULL OR "llmOutputTokens" >= 0),
  ADD CONSTRAINT "AgentRun_reservedCostMicros_nonnegative"
    CHECK ("reservedCostMicros" IS NULL OR "reservedCostMicros" >= 0);

CREATE INDEX "AgentRun_agencyId_shadowOnly_createdAt_idx"
  ON "AgentRun"("agencyId", "shadowOnly", "createdAt");
