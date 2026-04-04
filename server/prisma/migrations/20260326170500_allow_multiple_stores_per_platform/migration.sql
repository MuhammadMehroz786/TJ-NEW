-- DropIndex
DROP INDEX IF EXISTS "MarketplaceConnection_userId_platform_key";

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceConnection_userId_storeUrl_key" ON "MarketplaceConnection"("userId", "storeUrl");
