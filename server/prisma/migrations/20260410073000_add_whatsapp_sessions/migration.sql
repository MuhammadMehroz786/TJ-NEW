-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "userId" TEXT,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "creditsLimit" INTEGER NOT NULL DEFAULT 5,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_phoneNumber_key" ON "WhatsAppSession"("phoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppSession_state_lastMessageAt_idx" ON "WhatsAppSession"("state", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsAppSession_userId_idx" ON "WhatsAppSession"("userId");

-- AddForeignKey
ALTER TABLE "WhatsAppSession"
ADD CONSTRAINT "WhatsAppSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
