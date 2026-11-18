-- Versioned creator sales configuration and explicit product/price policy.
-- Existing mock catalog rows remain demo-ready; real-platform rows remain
-- disabled until a provider catalog sync verifies them.
BEGIN;

CREATE TYPE "VaultItemPlatformStatus" AS ENUM (
  'UNKNOWN', 'PROCESSING', 'READY', 'ERROR', 'UNAVAILABLE'
);

CREATE TABLE "CreatorSalesProfile" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "creatorAccountId" TEXT NOT NULL,
  "persona" TEXT NOT NULL,
  "kbText" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "businessHours" JSONB NOT NULL,
  "defaultControlMode" "ControlMode" NOT NULL DEFAULT 'ASSIST',
  "maxFollowUps" INTEGER NOT NULL DEFAULT 2,
  "globalPriceCapCents" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatorSalesProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreatorSalesProfile_maxFollowUps_check"
    CHECK ("maxFollowUps" >= 0 AND "maxFollowUps" <= 5),
  CONSTRAINT "CreatorSalesProfile_globalPriceCapCents_check"
    CHECK ("globalPriceCapCents" >= 100 AND "globalPriceCapCents" <= 1000000),
  CONSTRAINT "CreatorSalesProfile_version_check" CHECK ("version" >= 1)
);

ALTER TABLE "VaultItem"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "platformStatus" "VaultItemPlatformStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "minPriceCents" INTEGER,
  ADD COLUMN "maxPriceCents" INTEGER,
  ADD COLUMN "approvedPriceCents" INTEGER,
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);

ALTER TABLE "VaultItem"
  ADD CONSTRAINT "VaultItem_price_policy_check" CHECK (
    ("minPriceCents" IS NULL OR "minPriceCents" >= 100) AND
    ("maxPriceCents" IS NULL OR "maxPriceCents" <= 1000000) AND
    ("minPriceCents" IS NULL OR "maxPriceCents" IS NULL OR "minPriceCents" <= "maxPriceCents") AND
    ("approvedPriceCents" IS NULL OR "minPriceCents" IS NULL OR "approvedPriceCents" >= "minPriceCents") AND
    ("approvedPriceCents" IS NULL OR "maxPriceCents" IS NULL OR "approvedPriceCents" <= "maxPriceCents")
  );

UPDATE "VaultItem" AS item
SET
  "active" = true,
  "platformStatus" = 'READY',
  "minPriceCents" = item."defaultPriceCents",
  "maxPriceCents" = item."defaultPriceCents",
  "approvedPriceCents" = item."defaultPriceCents",
  "lastVerifiedAt" = CURRENT_TIMESTAMP
FROM "CreatorAccount" AS account
WHERE account."id" = item."creatorAccountId" AND account."platform" = 'mock';

ALTER TABLE "AgentRun" ADD COLUMN "salesProfileVersion" INTEGER;

CREATE UNIQUE INDEX "CreatorSalesProfile_agencyId_id_key"
  ON "CreatorSalesProfile"("agencyId", "id");
CREATE UNIQUE INDEX "CreatorSalesProfile_agencyId_creatorAccountId_key"
  ON "CreatorSalesProfile"("agencyId", "creatorAccountId");
CREATE INDEX "CreatorSalesProfile_agencyId_idx"
  ON "CreatorSalesProfile"("agencyId");
CREATE INDEX "VaultItem_creatorAccountId_active_platformStatus_idx"
  ON "VaultItem"("creatorAccountId", "active", "platformStatus");

ALTER TABLE "CreatorSalesProfile" ADD CONSTRAINT "CreatorSalesProfile_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorSalesProfile" ADD CONSTRAINT "CreatorSalesProfile_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
