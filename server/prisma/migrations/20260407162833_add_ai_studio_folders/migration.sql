-- AlterTable
ALTER TABLE "AiStudioImage" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "AiStudioFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiStudioFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiStudioFolder_userId_createdAt_idx" ON "AiStudioFolder"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiStudioFolder_userId_name_key" ON "AiStudioFolder"("userId", "name");

-- CreateIndex
CREATE INDEX "AiStudioImage_folderId_idx" ON "AiStudioImage"("folderId");

-- AddForeignKey
ALTER TABLE "AiStudioImage" ADD CONSTRAINT "AiStudioImage_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AiStudioFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiStudioFolder" ADD CONSTRAINT "AiStudioFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
