-- Fanvue live-sales transport and deterministic paid-message attribution.
-- Existing amountCents rows are USD-denominated by the original schema.
BEGIN;

ALTER TABLE "Transaction"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "providerMessageRef" TEXT;

CREATE UNIQUE INDEX "Transaction_creatorAccountId_fanId_providerMessageRef_key"
  ON "Transaction"("creatorAccountId", "fanId", "providerMessageRef");

COMMIT;
