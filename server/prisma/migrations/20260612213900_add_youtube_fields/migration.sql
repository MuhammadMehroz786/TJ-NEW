-- YouTube publishing fields for DailyDemoVideo (feat 661ac0e).
-- All additive and nullable/defaulted so existing rows are unaffected.
-- Applied directly to production on 2026-06-22 via ADD COLUMN IF NOT EXISTS
-- because the original feature commit shipped the schema change without a
-- migration file (developer used `db push`). This file backfills history.
ALTER TABLE "DailyDemoVideo" ADD COLUMN "youtubeStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "DailyDemoVideo" ADD COLUMN "youtubeId" TEXT;
ALTER TABLE "DailyDemoVideo" ADD COLUMN "youtubePublishedAt" TIMESTAMP(3);
ALTER TABLE "DailyDemoVideo" ADD COLUMN "youtubeErrorMessage" TEXT;
