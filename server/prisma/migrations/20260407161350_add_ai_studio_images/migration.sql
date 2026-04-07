-- CreateTable
CREATE TABLE "AiStudioImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "background" TEXT NOT NULL DEFAULT 'studio',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiStudioImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiStudioImage_userId_createdAt_idx" ON "AiStudioImage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiStudioImage" ADD CONSTRAINT "AiStudioImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
