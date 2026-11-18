-- Enforce tenant ownership at the PostgreSQL layer. This migration never
-- repairs or rewrites rows: it aborts before changing constraints if any
-- existing relation crosses agency boundaries.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Invitation" c JOIN "User" p ON p."id" = c."invitedById" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Invitation.invitedById crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "ChatterAssignment" c JOIN "User" p ON p."id" = c."userId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: ChatterAssignment.userId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "ChatterAssignment" c JOIN "CreatorAccount" p ON p."id" = c."creatorAccountId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: ChatterAssignment.creatorAccountId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Shift" c JOIN "User" p ON p."id" = c."userId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Shift.userId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Shift" c JOIN "CreatorAccount" p ON p."id" = c."creatorAccountId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Shift.creatorAccountId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Fan" c JOIN "CreatorAccount" p ON p."id" = c."creatorAccountId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Fan.creatorAccountId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "FanNote" c JOIN "Fan" p ON p."id" = c."fanId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: FanNote.fanId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "FanNote" c JOIN "User" p ON p."id" = c."authorId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: FanNote.authorId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "FanTagLink" c JOIN "Fan" p ON p."id" = c."fanId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: FanTagLink.fanId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "FanTagLink" c JOIN "FanTag" p ON p."id" = c."tagId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: FanTagLink.tagId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Conversation" c JOIN "CreatorAccount" p ON p."id" = c."creatorAccountId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Conversation.creatorAccountId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Conversation" c JOIN "Fan" p ON p."id" = c."fanId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Conversation.fanId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Message" c JOIN "Conversation" p ON p."id" = c."conversationId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Message.conversationId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Message" c JOIN "User" p ON p."id" = c."sentByUserId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Message.sentByUserId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Transaction" c JOIN "CreatorAccount" p ON p."id" = c."creatorAccountId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Transaction.creatorAccountId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Transaction" c JOIN "Fan" p ON p."id" = c."fanId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Transaction.fanId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Transaction" c JOIN "User" p ON p."id" = c."closedByUserId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Transaction.closedByUserId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Transaction" c JOIN "Shift" p ON p."id" = c."shiftId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Transaction.shiftId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "Transaction" c JOIN "VaultSend" p ON p."id" = c."vaultSendId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: Transaction.vaultSendId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "VaultItem" c JOIN "CreatorAccount" p ON p."id" = c."creatorAccountId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: VaultItem.creatorAccountId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "VaultSend" c JOIN "VaultItem" p ON p."id" = c."vaultItemId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: VaultSend.vaultItemId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "VaultSend" c JOIN "Fan" p ON p."id" = c."fanId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: VaultSend.fanId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "VaultSend" c JOIN "Message" p ON p."id" = c."messageId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: VaultSend.messageId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "VaultSend" c JOIN "User" p ON p."id" = c."sentByUserId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: VaultSend.sentByUserId crosses agency boundary';
  END IF;
  IF EXISTS (SELECT 1 FROM "AuditLog" c JOIN "User" p ON p."id" = c."actorId" WHERE c."agencyId" <> p."agencyId") THEN
    RAISE EXCEPTION '0005 tenant preflight failed: AuditLog.actorId crosses agency boundary';
  END IF;
END $$;

CREATE UNIQUE INDEX "User_agencyId_id_key" ON "User"("agencyId", "id");
CREATE UNIQUE INDEX "Shift_agencyId_id_key" ON "Shift"("agencyId", "id");
CREATE UNIQUE INDEX "FanTag_agencyId_id_key" ON "FanTag"("agencyId", "id");
CREATE UNIQUE INDEX "Transaction_agencyId_vaultSendId_key" ON "Transaction"("agencyId", "vaultSendId");
CREATE UNIQUE INDEX "VaultItem_agencyId_id_key" ON "VaultItem"("agencyId", "id");
CREATE UNIQUE INDEX "VaultSend_agencyId_messageId_key" ON "VaultSend"("agencyId", "messageId");

ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_invitedById_fkey";
ALTER TABLE "ChatterAssignment" DROP CONSTRAINT "ChatterAssignment_userId_fkey";
ALTER TABLE "ChatterAssignment" DROP CONSTRAINT "ChatterAssignment_creatorAccountId_fkey";
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_userId_fkey";
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_creatorAccountId_fkey";
ALTER TABLE "Fan" DROP CONSTRAINT "Fan_creatorAccountId_fkey";
ALTER TABLE "FanNote" DROP CONSTRAINT "FanNote_fanId_fkey";
ALTER TABLE "FanNote" DROP CONSTRAINT "FanNote_authorId_fkey";
ALTER TABLE "FanTagLink" DROP CONSTRAINT "FanTagLink_fanId_fkey";
ALTER TABLE "FanTagLink" DROP CONSTRAINT "FanTagLink_tagId_fkey";
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_creatorAccountId_fkey";
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_fanId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT "Message_conversationId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT "Message_sentByUserId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_creatorAccountId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_fanId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_closedByUserId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_shiftId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_vaultSendId_fkey";
ALTER TABLE "VaultItem" DROP CONSTRAINT "VaultItem_creatorAccountId_fkey";
ALTER TABLE "VaultSend" DROP CONSTRAINT "VaultSend_vaultItemId_fkey";
ALTER TABLE "VaultSend" DROP CONSTRAINT "VaultSend_fanId_fkey";
ALTER TABLE "VaultSend" DROP CONSTRAINT "VaultSend_messageId_fkey";
ALTER TABLE "VaultSend" DROP CONSTRAINT "VaultSend_sentByUserId_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_agencyId_invitedById_fkey"
  FOREIGN KEY ("agencyId", "invitedById") REFERENCES "User"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatterAssignment" ADD CONSTRAINT "ChatterAssignment_agencyId_userId_fkey"
  FOREIGN KEY ("agencyId", "userId") REFERENCES "User"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatterAssignment" ADD CONSTRAINT "ChatterAssignment_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_agencyId_userId_fkey"
  FOREIGN KEY ("agencyId", "userId") REFERENCES "User"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Fan" ADD CONSTRAINT "Fan_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FanNote" ADD CONSTRAINT "FanNote_agencyId_fanId_fkey"
  FOREIGN KEY ("agencyId", "fanId") REFERENCES "Fan"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FanNote" ADD CONSTRAINT "FanNote_agencyId_authorId_fkey"
  FOREIGN KEY ("agencyId", "authorId") REFERENCES "User"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FanTagLink" ADD CONSTRAINT "FanTagLink_agencyId_fanId_fkey"
  FOREIGN KEY ("agencyId", "fanId") REFERENCES "Fan"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FanTagLink" ADD CONSTRAINT "FanTagLink_agencyId_tagId_fkey"
  FOREIGN KEY ("agencyId", "tagId") REFERENCES "FanTag"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agencyId_fanId_fkey"
  FOREIGN KEY ("agencyId", "fanId") REFERENCES "Fan"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_agencyId_conversationId_fkey"
  FOREIGN KEY ("agencyId", "conversationId") REFERENCES "Conversation"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_agencyId_sentByUserId_fkey"
  FOREIGN KEY ("agencyId", "sentByUserId") REFERENCES "User"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_agencyId_fanId_fkey"
  FOREIGN KEY ("agencyId", "fanId") REFERENCES "Fan"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_agencyId_closedByUserId_fkey"
  FOREIGN KEY ("agencyId", "closedByUserId") REFERENCES "User"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_agencyId_shiftId_fkey"
  FOREIGN KEY ("agencyId", "shiftId") REFERENCES "Shift"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_agencyId_vaultSendId_fkey"
  FOREIGN KEY ("agencyId", "vaultSendId") REFERENCES "VaultSend"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VaultItem" ADD CONSTRAINT "VaultItem_agencyId_creatorAccountId_fkey"
  FOREIGN KEY ("agencyId", "creatorAccountId") REFERENCES "CreatorAccount"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultSend" ADD CONSTRAINT "VaultSend_agencyId_vaultItemId_fkey"
  FOREIGN KEY ("agencyId", "vaultItemId") REFERENCES "VaultItem"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultSend" ADD CONSTRAINT "VaultSend_agencyId_fanId_fkey"
  FOREIGN KEY ("agencyId", "fanId") REFERENCES "Fan"("agencyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultSend" ADD CONSTRAINT "VaultSend_agencyId_messageId_fkey"
  FOREIGN KEY ("agencyId", "messageId") REFERENCES "Message"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VaultSend" ADD CONSTRAINT "VaultSend_agencyId_sentByUserId_fkey"
  FOREIGN KEY ("agencyId", "sentByUserId") REFERENCES "User"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_agencyId_actorId_fkey"
  FOREIGN KEY ("agencyId", "actorId") REFERENCES "User"("agencyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
