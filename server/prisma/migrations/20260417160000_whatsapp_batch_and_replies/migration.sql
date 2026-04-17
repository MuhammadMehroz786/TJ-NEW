-- New table: map every outbound enhanced image (by its WhatsApp message ID)
-- back to the source image base64, so user replies can target a specific image.
CREATE TABLE "WhatsAppEnhancement" (
  "id"             TEXT         NOT NULL,
  "sessionId"      TEXT         NOT NULL,
  "outboundWamid"  TEXT         NOT NULL,
  "sourceImage"    TEXT         NOT NULL,
  "sourceMimeType" TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppEnhancement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppEnhancement_outboundWamid_key" ON "WhatsAppEnhancement"("outboundWamid");
CREATE INDEX "WhatsAppEnhancement_sessionId_createdAt_idx" ON "WhatsAppEnhancement"("sessionId", "createdAt");

ALTER TABLE "WhatsAppEnhancement"
  ADD CONSTRAINT "WhatsAppEnhancement_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
