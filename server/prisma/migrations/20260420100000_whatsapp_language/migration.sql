-- EN/AR language preference per WhatsApp session. Default to English so
-- existing sessions don't surprise users with Arabic on the next message.
ALTER TABLE "WhatsAppSession"
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
