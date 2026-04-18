-- Passwordless magic-code login for admins.
-- One row per email; upserted on each login request; deleted on successful verify.
CREATE TABLE "AdminLoginCode" (
  "id"           TEXT         NOT NULL,
  "email"        TEXT         NOT NULL,
  "codeHash"     TEXT         NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "attempts"     INTEGER      NOT NULL DEFAULT 0,
  "requestedIp"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminLoginCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminLoginCode_email_key" ON "AdminLoginCode"("email");
CREATE INDEX "AdminLoginCode_expiresAt_idx" ON "AdminLoginCode"("expiresAt");
