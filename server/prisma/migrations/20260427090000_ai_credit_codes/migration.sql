-- AiCreditCode: admin-issued promo codes that grant AI credits
CREATE TABLE "AiCreditCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "maxRedemptions" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCreditCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCreditCode_code_key" ON "AiCreditCode"("code");
CREATE INDEX "AiCreditCode_code_idx" ON "AiCreditCode"("code");

-- AiCreditCodeRedemption: one per (code, user)
CREATE TABLE "AiCreditCodeRedemption" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCreditCodeRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCreditCodeRedemption_codeId_userId_key" ON "AiCreditCodeRedemption"("codeId", "userId");
CREATE INDEX "AiCreditCodeRedemption_userId_createdAt_idx" ON "AiCreditCodeRedemption"("userId", "createdAt");

ALTER TABLE "AiCreditCodeRedemption" ADD CONSTRAINT "AiCreditCodeRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "AiCreditCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCreditCodeRedemption" ADD CONSTRAINT "AiCreditCodeRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
