-- Passwordless return on explicitly trusted browsers. Bearer values are
-- stored only as SHA-256 digests; the raw rotating token remains in an
-- httpOnly cookie.
BEGIN;

ALTER TABLE "MfaChallenge"
ADD COLUMN "rememberDevice" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "TrustedDevice" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key"
ON "TrustedDevice"("tokenHash");
CREATE UNIQUE INDEX "TrustedDevice_agencyId_id_key"
ON "TrustedDevice"("agencyId", "id");
CREATE INDEX "TrustedDevice_agencyId_userId_revokedAt_expiresAt_idx"
ON "TrustedDevice"("agencyId", "userId", "revokedAt", "expiresAt");
CREATE INDEX "TrustedDevice_expiresAt_idx"
ON "TrustedDevice"("expiresAt");

ALTER TABLE "Session"
ADD COLUMN "trustedDeviceId" TEXT;
CREATE INDEX "Session_trustedDeviceId_idx"
ON "Session"("trustedDeviceId");

ALTER TABLE "TrustedDevice"
ADD CONSTRAINT "TrustedDevice_agencyId_fkey"
FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustedDevice"
ADD CONSTRAINT "TrustedDevice_agencyId_userId_fkey"
FOREIGN KEY ("agencyId", "userId") REFERENCES "User"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session"
ADD CONSTRAINT "Session_trustedDeviceId_fkey"
FOREIGN KEY ("trustedDeviceId") REFERENCES "TrustedDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
