-- CreateEnum
CREATE TYPE "PlatformAuthMethod" AS ENUM (
  'MOCK',
  'TELEGRAM_BOT',
  'FANVUE_OAUTH',
  'FANSLY_MANAGEMENT_SESSION',
  'ONLYFANS_DESKTOP_SESSION'
);

-- CreateEnum
CREATE TYPE "PlatformConnectionStatus" AS ENUM (
  'DRAFT',
  'AUTHORIZING',
  'VERIFYING',
  'SYNCING',
  'ACTIVE',
  'REAUTH_REQUIRED',
  'REVOKED',
  'ERROR'
);

-- CreateTable
CREATE TABLE "PlatformConnection" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "creatorAccountId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "authMethod" "PlatformAuthMethod" NOT NULL,
  "status" "PlatformConnectionStatus" NOT NULL DEFAULT 'DRAFT',
  "remoteAccountId" TEXT,
  "secretRef" TEXT,
  "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastVerifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

-- Backfill one connection per existing creator account without changing the
-- account, fan, conversation, message, transaction, or revenue rows.
INSERT INTO "PlatformConnection" (
  "id",
  "agencyId",
  "creatorAccountId",
  "platform",
  "authMethod",
  "status",
  "grantedScopes",
  "capabilities",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "agencyId",
  "id",
  "platform",
  CASE "platform"
    WHEN 'mock' THEN 'MOCK'::"PlatformAuthMethod"
    WHEN 'telegram' THEN 'TELEGRAM_BOT'::"PlatformAuthMethod"
    WHEN 'fanvue' THEN 'FANVUE_OAUTH'::"PlatformAuthMethod"
    WHEN 'fansly' THEN 'FANSLY_MANAGEMENT_SESSION'::"PlatformAuthMethod"
    WHEN 'onlyfans' THEN 'ONLYFANS_DESKTOP_SESSION'::"PlatformAuthMethod"
  END,
  CASE
    WHEN "platform" = 'mock' THEN 'ACTIVE'::"PlatformConnectionStatus"
    ELSE 'DRAFT'::"PlatformConnectionStatus"
  END,
  ARRAY[]::TEXT[],
  CASE
    WHEN "platform" = 'mock'
      THEN ARRAY['sync', 'send_text', 'send_ppv', 'auto_reply']::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END,
  "createdAt",
  CURRENT_TIMESTAMP
FROM "CreatorAccount";

-- CreateIndex
CREATE UNIQUE INDEX "CreatorAccount_agencyId_id_key"
  ON "CreatorAccount"("agencyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_agencyId_creatorAccountId_key"
  ON "PlatformConnection"("agencyId", "creatorAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_platform_remoteAccountId_key"
  ON "PlatformConnection"("platform", "remoteAccountId");

-- CreateIndex
CREATE INDEX "PlatformConnection_agencyId_status_idx"
  ON "PlatformConnection"("agencyId", "status");

-- AddForeignKey
ALTER TABLE "PlatformConnection"
  ADD CONSTRAINT "PlatformConnection_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformConnection"
  ADD CONSTRAINT "PlatformConnection_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId")
  REFERENCES "CreatorAccount"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
