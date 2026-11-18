-- CreateTable
CREATE TABLE "PlatformCredential" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "refreshLeaseOwner" TEXT,
  "refreshLeaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformCredential_pkey" PRIMARY KEY ("id")
);

-- Composite keys keep the credential inside the same tenant as its connection.
CREATE UNIQUE INDEX "PlatformConnection_agencyId_id_key"
  ON "PlatformConnection"("agencyId", "id");

CREATE UNIQUE INDEX "PlatformCredential_agencyId_connectionId_key"
  ON "PlatformCredential"("agencyId", "connectionId");

CREATE INDEX "PlatformCredential_agencyId_idx"
  ON "PlatformCredential"("agencyId");

ALTER TABLE "PlatformCredential"
  ADD CONSTRAINT "PlatformCredential_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformCredential"
  ADD CONSTRAINT "PlatformCredential_agencyId_connectionId_fkey"
  FOREIGN KEY ("agencyId", "connectionId")
  REFERENCES "PlatformConnection"("agencyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
