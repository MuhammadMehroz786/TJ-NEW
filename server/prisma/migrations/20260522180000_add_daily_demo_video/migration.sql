-- DailyDemoVideo: auto-generated 10-15s before/after slideshow for TijarFlow's
-- own social marketing. Cron triggers at 09:00 KSA; admins can manually trigger
-- from the dashboard. Unique on (forDate, niche) so re-runs are idempotent.
CREATE TABLE "DailyDemoVideo" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forDate" DATE NOT NULL,
    "niche" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "script" JSONB,
    "imagePaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "voiceoverPath" TEXT,
    "videoPath" TEXT,
    "thumbnailPath" TEXT,
    "costCents" INTEGER,
    "renderMs" INTEGER,
    "triggeredBy" TEXT NOT NULL DEFAULT 'cron',

    CONSTRAINT "DailyDemoVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyDemoVideo_forDate_niche_key" ON "DailyDemoVideo"("forDate", "niche");
CREATE INDEX "DailyDemoVideo_createdAt_idx" ON "DailyDemoVideo"("createdAt");
CREATE INDEX "DailyDemoVideo_status_idx" ON "DailyDemoVideo"("status");
