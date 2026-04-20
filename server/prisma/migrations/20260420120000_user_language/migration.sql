-- User's preferred UI language. Synced with i18next in the web app so the
-- choice persists across devices. WhatsApp has its own per-session language
-- (WhatsAppSession.language) — they are independent by design.
ALTER TABLE "User"
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
