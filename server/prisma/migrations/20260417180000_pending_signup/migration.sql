-- Signup email-verification flow: park submitted credentials with a hashed
-- 6-digit OTP. User row is only created after the code is verified.
CREATE TABLE "PendingSignup" (
  "id"            TEXT         NOT NULL,
  "email"         TEXT         NOT NULL,
  "passwordHash"  TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "role"          "UserRole"   NOT NULL DEFAULT 'MERCHANT',
  "otpHash"       TEXT         NOT NULL,
  "otpExpiresAt"  TIMESTAMP(3) NOT NULL,
  "attempts"      INTEGER      NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingSignup_email_key" ON "PendingSignup"("email");
CREATE INDEX "PendingSignup_email_idx" ON "PendingSignup"("email");
CREATE INDEX "PendingSignup_otpExpiresAt_idx" ON "PendingSignup"("otpExpiresAt");
