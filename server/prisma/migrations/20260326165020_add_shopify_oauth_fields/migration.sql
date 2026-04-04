-- AlterTable
ALTER TABLE "MarketplaceConnection" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "clientSecret" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3);
