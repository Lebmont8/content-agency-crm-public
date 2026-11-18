ALTER TYPE "DesktopConnectorCommandKind" ADD VALUE 'SEND_TEXT';

ALTER TABLE "DesktopConnectorCommand"
  ADD COLUMN "outboundDeliveryId" TEXT,
  ADD COLUMN "outboundAttemptNumber" INTEGER;

ALTER TABLE "DesktopConnectorCommand"
  ADD CONSTRAINT "DesktopConnectorCommand_send_text_target_consistent"
  CHECK (
    (
      "kind"::text = 'SEND_TEXT'
      AND "outboundDeliveryId" IS NOT NULL
      AND "outboundAttemptNumber" IS NOT NULL
      AND "outboundAttemptNumber" > 0
    )
    OR
    (
      "kind"::text <> 'SEND_TEXT'
      AND "outboundDeliveryId" IS NULL
      AND "outboundAttemptNumber" IS NULL
    )
  );

ALTER TABLE "DesktopConnectorCommand"
  ADD CONSTRAINT "DesktopConnectorCommand_agencyId_outboundDeliveryId_fkey"
  FOREIGN KEY ("agencyId", "outboundDeliveryId")
  REFERENCES "OutboundDelivery"("agencyId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX "DesktopConnectorCommand_agencyId_outboundDeliveryId_outboundAttemptNumber_idx"
  ON "DesktopConnectorCommand"("agencyId", "outboundDeliveryId", "outboundAttemptNumber");
