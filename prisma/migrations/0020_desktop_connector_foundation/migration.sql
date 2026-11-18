CREATE TYPE "DesktopConnectorDeviceStatus" AS ENUM (
  'PAIRING',
  'ACTIVE',
  'REVOKED'
);

CREATE TYPE "DesktopConnectorProfileStatus" AS ENUM (
  'LOCKED',
  'READY',
  'REAUTH_REQUIRED',
  'REVOKED',
  'ERROR'
);

CREATE TYPE "DesktopConnectorCommandKind" AS ENUM (
  'VERIFY_PROFILE',
  'SYNC_SNAPSHOT'
);

CREATE TYPE "DesktopConnectorCommandStatus" AS ENUM (
  'PENDING',
  'LEASED',
  'SUCCEEDED',
  'FAILED',
  'CANCELED'
);

CREATE TABLE "DesktopConnectorDevice" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "pairedByUserId" TEXT NOT NULL,
  "status" "DesktopConnectorDeviceStatus" NOT NULL DEFAULT 'PAIRING',
  "label" TEXT NOT NULL,
  "pairingCodeHash" TEXT,
  "pairingExpiresAt" TIMESTAMP(3),
  "tokenHash" TEXT,
  "publicKeySpki" TEXT,
  "protocolVersion" INTEGER,
  "appVersion" TEXT,
  "pairedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DesktopConnectorDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DesktopConnectorDevice_protocolVersion_positive"
    CHECK ("protocolVersion" IS NULL OR "protocolVersion" > 0),
  CONSTRAINT "DesktopConnectorDevice_state_consistent" CHECK (
    (
      "status" = 'PAIRING'
      AND "pairingCodeHash" IS NOT NULL
      AND "pairingExpiresAt" IS NOT NULL
      AND "tokenHash" IS NULL
      AND "pairedAt" IS NULL
      AND "revokedAt" IS NULL
    )
    OR (
      "status" = 'ACTIVE'
      AND "pairingCodeHash" IS NULL
      AND "pairingExpiresAt" IS NULL
      AND "tokenHash" IS NOT NULL
      AND "publicKeySpki" IS NOT NULL
      AND "protocolVersion" IS NOT NULL
      AND "pairedAt" IS NOT NULL
      AND "revokedAt" IS NULL
    )
    OR (
      "status" = 'REVOKED'
      AND "pairingCodeHash" IS NULL
      AND "pairingExpiresAt" IS NULL
      AND "tokenHash" IS NULL
      AND "revokedAt" IS NOT NULL
    )
  )
);

CREATE TABLE "DesktopConnectorProfile" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "creatorAccountId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" "DesktopConnectorProfileStatus" NOT NULL DEFAULT 'LOCKED',
  "lastVerifiedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DesktopConnectorProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DesktopConnectorProfile_platform_supported"
    CHECK ("platform" IN ('onlyfans', 'fansly'))
);

CREATE TABLE "DesktopConnectorRequest" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DesktopConnectorRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesktopConnectorCommand" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "kind" "DesktopConnectorCommandKind" NOT NULL,
  "status" "DesktopConnectorCommandStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "resultDigest" TEXT,
  "lastErrorCode" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DesktopConnectorCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DesktopConnectorCommand_attempts_valid"
    CHECK ("attemptCount" >= 0 AND "maxAttempts" > 0),
  CONSTRAINT "DesktopConnectorCommand_lease_consistent" CHECK (
    ("status" = 'LEASED' AND "leaseOwner" IS NOT NULL AND "leaseUntil" IS NOT NULL)
    OR
    ("status" <> 'LEASED' AND "leaseOwner" IS NULL AND "leaseUntil" IS NULL)
  )
);

CREATE UNIQUE INDEX "DesktopConnectorDevice_pairingCodeHash_key"
  ON "DesktopConnectorDevice"("pairingCodeHash");
CREATE UNIQUE INDEX "DesktopConnectorDevice_tokenHash_key"
  ON "DesktopConnectorDevice"("tokenHash");
CREATE UNIQUE INDEX "DesktopConnectorDevice_agencyId_id_key"
  ON "DesktopConnectorDevice"("agencyId", "id");
CREATE INDEX "DesktopConnectorDevice_agencyId_status_lastSeenAt_idx"
  ON "DesktopConnectorDevice"("agencyId", "status", "lastSeenAt");
CREATE INDEX "DesktopConnectorDevice_pairingExpiresAt_idx"
  ON "DesktopConnectorDevice"("pairingExpiresAt");

CREATE UNIQUE INDEX "DesktopConnectorProfile_agencyId_id_key"
  ON "DesktopConnectorProfile"("agencyId", "id");
CREATE UNIQUE INDEX "DesktopConnectorProfile_agencyId_creatorAccountId_key"
  ON "DesktopConnectorProfile"("agencyId", "creatorAccountId");
CREATE UNIQUE INDEX "DesktopConnectorProfile_agencyId_connectionId_key"
  ON "DesktopConnectorProfile"("agencyId", "connectionId");
CREATE INDEX "DesktopConnectorProfile_agencyId_deviceId_status_idx"
  ON "DesktopConnectorProfile"("agencyId", "deviceId", "status");

CREATE UNIQUE INDEX "DesktopConnectorRequest_agencyId_id_key"
  ON "DesktopConnectorRequest"("agencyId", "id");
CREATE UNIQUE INDEX "DesktopConnectorRequest_deviceId_requestId_key"
  ON "DesktopConnectorRequest"("deviceId", "requestId");
CREATE INDEX "DesktopConnectorRequest_agencyId_expiresAt_idx"
  ON "DesktopConnectorRequest"("agencyId", "expiresAt");

CREATE UNIQUE INDEX "DesktopConnectorCommand_agencyId_id_key"
  ON "DesktopConnectorCommand"("agencyId", "id");
CREATE UNIQUE INDEX "DesktopConnectorCommand_deviceId_idempotencyKey_key"
  ON "DesktopConnectorCommand"("deviceId", "idempotencyKey");
CREATE INDEX "DesktopConnectorCommand_agencyId_deviceId_status_nextAttemptAt_idx"
  ON "DesktopConnectorCommand"("agencyId", "deviceId", "status", "nextAttemptAt");
CREATE INDEX "DesktopConnectorCommand_leaseUntil_idx"
  ON "DesktopConnectorCommand"("leaseUntil");

ALTER TABLE "DesktopConnectorDevice"
  ADD CONSTRAINT "DesktopConnectorDevice_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorDevice"
  ADD CONSTRAINT "DesktopConnectorDevice_agencyId_pairedByUserId_fkey"
  FOREIGN KEY ("agencyId", "pairedByUserId") REFERENCES "User"("agencyId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorProfile"
  ADD CONSTRAINT "DesktopConnectorProfile_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorProfile"
  ADD CONSTRAINT "DesktopConnectorProfile_agencyId_deviceId_fkey"
  FOREIGN KEY ("agencyId", "deviceId")
  REFERENCES "DesktopConnectorDevice"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorProfile"
  ADD CONSTRAINT "DesktopConnectorProfile_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId")
  REFERENCES "CreatorAccount"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorProfile"
  ADD CONSTRAINT "DesktopConnectorProfile_agencyId_connectionId_fkey"
  FOREIGN KEY ("agencyId", "connectionId")
  REFERENCES "PlatformConnection"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorRequest"
  ADD CONSTRAINT "DesktopConnectorRequest_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorRequest"
  ADD CONSTRAINT "DesktopConnectorRequest_agencyId_deviceId_fkey"
  FOREIGN KEY ("agencyId", "deviceId")
  REFERENCES "DesktopConnectorDevice"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorCommand"
  ADD CONSTRAINT "DesktopConnectorCommand_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorCommand"
  ADD CONSTRAINT "DesktopConnectorCommand_agencyId_deviceId_fkey"
  FOREIGN KEY ("agencyId", "deviceId")
  REFERENCES "DesktopConnectorDevice"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesktopConnectorCommand"
  ADD CONSTRAINT "DesktopConnectorCommand_agencyId_profileId_fkey"
  FOREIGN KEY ("agencyId", "profileId")
  REFERENCES "DesktopConnectorProfile"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
