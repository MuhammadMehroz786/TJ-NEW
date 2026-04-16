-- CreateEnum
CREATE TYPE "CreditPurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'REFUNDED');

-- AlterTable
ALTER TABLE "MarketplaceConnection" ADD COLUMN     "refreshToken" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "purchasedCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "status" "CreditPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditPurchase_stripeSessionId_key" ON "CreditPurchase"("stripeSessionId");

-- CreateIndex
CREATE INDEX "CreditPurchase_userId_createdAt_idx" ON "CreditPurchase"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditPurchase" ADD CONSTRAINT "CreditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
