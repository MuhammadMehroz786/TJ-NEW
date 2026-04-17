-- AlterTable: add OTP verification and refinement-context fields to WhatsAppSession
ALTER TABLE "WhatsAppSession"
  ADD COLUMN "pendingEmail"       TEXT,
  ADD COLUMN "emailOtpHash"       TEXT,
  ADD COLUMN "emailOtpExpiresAt"  TIMESTAMP(3),
  ADD COLUMN "otpAttempts"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pendingTheme"       TEXT,
  ADD COLUMN "lastSourceImage"    TEXT,
  ADD COLUMN "lastSourceMimeType" TEXT;
