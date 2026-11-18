-- Owner-controlled AI communication, content pricing, notifications and crypto billing foundation.

ALTER TYPE "InternalNotificationType" ADD VALUE IF NOT EXISTS 'CUSTOM_CONTENT_REQUEST';
ALTER TYPE "InternalNotificationType" ADD VALUE IF NOT EXISTS 'NEW_LEAD';
ALTER TYPE "InternalNotificationType" ADD VALUE IF NOT EXISTS 'LARGE_PURCHASE';
ALTER TYPE "InternalNotificationType" ADD VALUE IF NOT EXISTS 'INTEGRATION_ERROR';
ALTER TYPE "InternalNotificationType" ADD VALUE IF NOT EXISTS 'AI_ERROR';
ALTER TYPE "InternalNotificationType" ADD VALUE IF NOT EXISTS 'BILLING_DUE';
ALTER TYPE "InternalNotificationType" ADD VALUE IF NOT EXISTS 'AI_SUSPENDED';

BEGIN;

ALTER TABLE "CreatorSalesProfile"
  ADD COLUMN "stylePreset" TEXT NOT NULL DEFAULT 'BALANCED',
  ADD COLUMN "firstMessage" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "ownerInstructions" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "draftConfig" JSONB,
  ADD COLUMN "previousPublishedConfig" JSONB,
  ADD COLUMN "draftUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "CreatorSalesProfile"
SET "publishedAt" = "updatedAt"
WHERE "publishedAt" IS NULL;

ALTER TABLE "InternalNotification"
  ALTER COLUMN "conversationId" DROP NOT NULL,
  ADD COLUMN "creatorAccountId" TEXT,
  ADD COLUMN "title" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "body" TEXT,
  ADD COLUMN "actionPath" TEXT,
  ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'INFO';

ALTER TABLE "User"
  ADD COLUMN "telegramNotificationChatId" TEXT,
  ADD COLUMN "telegramNotificationVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "telegramNotificationPairingHash" TEXT,
  ADD COLUMN "telegramNotificationPairingExpiry" TIMESTAMP(3);

ALTER TABLE "VaultItem"
  ADD COLUMN "priceGroupId" TEXT,
  ADD COLUMN "priceMode" TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "maxDiscountPercent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "priceOverrideEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BillingRecord"
  ADD COLUMN "dueAt" TIMESTAMP(3),
  ADD COLUMN "graceEndsAt" TIMESTAMP(3),
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "network" TEXT,
  ADD COLUMN "txHash" TEXT;

CREATE TABLE "VaultPriceGroup" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "creatorAccountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "basePriceCents" INTEGER NOT NULL,
  "minPriceCents" INTEGER NOT NULL,
  "maxPriceCents" INTEGER NOT NULL,
  "priceMode" TEXT NOT NULL DEFAULT 'FIXED',
  "maxDiscountPercent" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VaultPriceGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserNotificationPreference" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "creatorAccountId" TEXT,
  "scopeKey" TEXT NOT NULL DEFAULT '*',
  "eventType" TEXT NOT NULL,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
  "deliveryMode" TEXT NOT NULL DEFAULT 'IMMEDIATE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentRequest" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "creatorAccountId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "sourceMessageId" TEXT,
  "assignedUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "summary" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentRequest_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "CryptoPaymentStatus" AS ENUM (
  'CREATED', 'SUBMITTED', 'VERIFYING', 'CONFIRMED', 'REJECTED', 'EXPIRED'
);

CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'SENT', 'RETRY', 'FAILED'
);

CREATE TABLE "CryptoPayment" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "billingRecordId" TEXT,
  "asset" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "assetAmount" TEXT NOT NULL,
  "txHash" TEXT,
  "status" "CryptoPaymentStatus" NOT NULL DEFAULT 'CREATED',
  "confirmations" INTEGER NOT NULL DEFAULT 0,
  "requiredConfirmations" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CryptoPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultPriceGroup_agencyId_id_key" ON "VaultPriceGroup"("agencyId", "id");
CREATE UNIQUE INDEX "VaultPriceGroup_creatorAccountId_name_key" ON "VaultPriceGroup"("creatorAccountId", "name");
CREATE INDEX "VaultPriceGroup_agencyId_creatorAccountId_idx" ON "VaultPriceGroup"("agencyId", "creatorAccountId");
CREATE UNIQUE INDEX "UserNotificationPreference_agencyId_userId_scopeKey_eventType_key" ON "UserNotificationPreference"("agencyId", "userId", "scopeKey", "eventType");
CREATE UNIQUE INDEX "UserNotificationPreference_agencyId_id_key" ON "UserNotificationPreference"("agencyId", "id");
CREATE INDEX "UserNotificationPreference_agencyId_userId_idx" ON "UserNotificationPreference"("agencyId", "userId");
CREATE INDEX "UserNotificationPreference_agencyId_creatorAccountId_idx" ON "UserNotificationPreference"("agencyId", "creatorAccountId");
CREATE UNIQUE INDEX "ContentRequest_agencyId_id_key" ON "ContentRequest"("agencyId", "id");
CREATE UNIQUE INDEX "ContentRequest_agencyId_sourceMessageId_key" ON "ContentRequest"("agencyId", "sourceMessageId");
CREATE INDEX "ContentRequest_agencyId_status_requestedAt_idx" ON "ContentRequest"("agencyId", "status", "requestedAt");
CREATE INDEX "ContentRequest_agencyId_creatorAccountId_status_idx" ON "ContentRequest"("agencyId", "creatorAccountId", "status");
CREATE INDEX "ContentRequest_agencyId_assignedUserId_status_idx" ON "ContentRequest"("agencyId", "assignedUserId", "status");
CREATE UNIQUE INDEX "BillingRecord_agencyId_id_key" ON "BillingRecord"("agencyId", "id");
CREATE UNIQUE INDEX "BillingRecord_agencyId_periodStart_periodEnd_key" ON "BillingRecord"("agencyId", "periodStart", "periodEnd");
CREATE INDEX "BillingRecord_agencyId_periodEnd_status_idx" ON "BillingRecord"("agencyId", "periodEnd", "status");
CREATE UNIQUE INDEX "CryptoPayment_agencyId_id_key" ON "CryptoPayment"("agencyId", "id");
CREATE UNIQUE INDEX "CryptoPayment_network_txHash_key" ON "CryptoPayment"("network", "txHash");
CREATE INDEX "CryptoPayment_agencyId_status_expiresAt_idx" ON "CryptoPayment"("agencyId", "status", "expiresAt");
CREATE INDEX "CryptoPayment_agencyId_billingRecordId_idx" ON "CryptoPayment"("agencyId", "billingRecordId");
CREATE INDEX "InternalNotification_agencyId_creatorAccountId_createdAt_idx" ON "InternalNotification"("agencyId", "creatorAccountId", "createdAt");
CREATE INDEX "VaultItem_agencyId_priceGroupId_idx" ON "VaultItem"("agencyId", "priceGroupId");
CREATE UNIQUE INDEX "NotificationDelivery_agencyId_id_key" ON "NotificationDelivery"("agencyId", "id");
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");
CREATE INDEX "NotificationDelivery_agencyId_status_nextAttemptAt_idx" ON "NotificationDelivery"("agencyId", "status", "nextAttemptAt");

ALTER TABLE "VaultPriceGroup" ADD CONSTRAINT "VaultPriceGroup_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultPriceGroup" ADD CONSTRAINT "VaultPriceGroup_agencyId_creatorAccountId_fkey" FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultItem" ADD CONSTRAINT "VaultItem_agencyId_priceGroupId_fkey" FOREIGN KEY ("agencyId", "priceGroupId") REFERENCES "VaultPriceGroup"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_agencyId_userId_fkey" FOREIGN KEY ("agencyId", "userId") REFERENCES "User"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_agencyId_creatorAccountId_fkey" FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_agencyId_creatorAccountId_fkey" FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_agencyId_conversationId_fkey" FOREIGN KEY ("agencyId", "conversationId") REFERENCES "Conversation"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_agencyId_assignedUserId_fkey" FOREIGN KEY ("agencyId", "assignedUserId") REFERENCES "User"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_agencyId_sourceMessageId_fkey" FOREIGN KEY ("agencyId", "sourceMessageId") REFERENCES "Message"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNotification" ADD CONSTRAINT "InternalNotification_agencyId_creatorAccountId_fkey" FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_agencyId_billingRecordId_fkey" FOREIGN KEY ("agencyId", "billingRecordId") REFERENCES "BillingRecord"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_agencyId_notificationId_fkey" FOREIGN KEY ("agencyId", "notificationId") REFERENCES "InternalNotification"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
