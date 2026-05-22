-- Register-CTA tracking columns for the WhatsApp guest-to-merchant pitch
-- (Issue #74 on TijarFlow-V1). Both nullable so existing rows are unaffected;
-- once a column is populated for a given phone number, that CTA never fires
-- again for that user.
ALTER TABLE "WhatsAppSession"
  ADD COLUMN "reengageCtaSentAt" TIMESTAMP(3),
  ADD COLUMN "exhaustionCtaSentAt" TIMESTAMP(3);
