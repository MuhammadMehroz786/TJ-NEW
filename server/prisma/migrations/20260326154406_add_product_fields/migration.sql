-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productType" TEXT,
ADD COLUMN     "vendor" TEXT,
ADD COLUMN     "weight" DECIMAL(10,2),
ADD COLUMN     "weightUnit" TEXT DEFAULT 'kg';
