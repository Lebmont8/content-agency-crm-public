-- Authentication hardening is intentionally atomic: existing opaque tokens
-- are converted in place so active sessions and invitation URLs keep working.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "Session" RENAME COLUMN "token" TO "tokenHash";
ALTER INDEX "Session_token_key" RENAME TO "Session_tokenHash_key";
UPDATE "Session"
SET "tokenHash" = encode(digest("tokenHash", 'sha256'), 'hex');

ALTER TABLE "Invitation" RENAME COLUMN "token" TO "tokenHash";
ALTER INDEX "Invitation_token_key" RENAME TO "Invitation_tokenHash_key";
UPDATE "Invitation"
SET "tokenHash" = encode(digest("tokenHash", 'sha256'), 'hex');

CREATE TABLE "LoginThrottle" (
  "identifierHash" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("identifierHash")
);

CREATE INDEX "LoginThrottle_blockedUntil_idx"
ON "LoginThrottle"("blockedUntil");

COMMIT;
