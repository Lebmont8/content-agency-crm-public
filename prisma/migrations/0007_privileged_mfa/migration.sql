-- Privileged MFA foundation. Existing privileged sessions are intentionally
-- revoked so they cannot bypass the new second-factor requirement.
BEGIN;

CREATE TYPE "MfaChallengePurpose" AS ENUM ('SETUP', 'LOGIN');

CREATE TABLE "UserMfaCredential" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "secretCiphertext" TEXT NOT NULL,
  "secretIv" TEXT NOT NULL,
  "secretAuthTag" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "enabledAt" TIMESTAMP(3),
  "lastAcceptedStep" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserMfaCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaRecoveryCode" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaChallenge" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" "MfaChallengePurpose" NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MfaChallenge_attempts_check"
    CHECK ("attemptCount" >= 0 AND "maxAttempts" > 0 AND "attemptCount" <= "maxAttempts")
);

CREATE UNIQUE INDEX "UserMfaCredential_agencyId_id_key"
ON "UserMfaCredential"("agencyId", "id");
CREATE UNIQUE INDEX "UserMfaCredential_agencyId_userId_key"
ON "UserMfaCredential"("agencyId", "userId");
CREATE INDEX "UserMfaCredential_agencyId_enabledAt_idx"
ON "UserMfaCredential"("agencyId", "enabledAt");

CREATE UNIQUE INDEX "MfaRecoveryCode_agencyId_credentialId_codeHash_key"
ON "MfaRecoveryCode"("agencyId", "credentialId", "codeHash");
CREATE INDEX "MfaRecoveryCode_agencyId_credentialId_usedAt_idx"
ON "MfaRecoveryCode"("agencyId", "credentialId", "usedAt");

CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key"
ON "MfaChallenge"("tokenHash");
CREATE INDEX "MfaChallenge_agencyId_userId_expiresAt_idx"
ON "MfaChallenge"("agencyId", "userId", "expiresAt");
CREATE INDEX "MfaChallenge_expiresAt_idx"
ON "MfaChallenge"("expiresAt");

ALTER TABLE "UserMfaCredential"
ADD CONSTRAINT "UserMfaCredential_agencyId_fkey"
FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMfaCredential"
ADD CONSTRAINT "UserMfaCredential_agencyId_userId_fkey"
FOREIGN KEY ("agencyId", "userId") REFERENCES "User"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MfaRecoveryCode"
ADD CONSTRAINT "MfaRecoveryCode_agencyId_fkey"
FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MfaRecoveryCode"
ADD CONSTRAINT "MfaRecoveryCode_agencyId_credentialId_fkey"
FOREIGN KEY ("agencyId", "credentialId") REFERENCES "UserMfaCredential"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MfaChallenge"
ADD CONSTRAINT "MfaChallenge_agencyId_fkey"
FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MfaChallenge"
ADD CONSTRAINT "MfaChallenge_agencyId_userId_fkey"
FOREIGN KEY ("agencyId", "userId") REFERENCES "User"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

DELETE FROM "Session" AS s
USING "User" AS u
WHERE s."userId" = u."id"
  AND (u."role" = 'OWNER' OR u."isPlatformAdmin" = TRUE);

COMMIT;
