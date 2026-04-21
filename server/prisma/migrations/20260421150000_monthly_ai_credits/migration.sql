-- Switch free AI credits from weekly-50 to monthly-30.
-- Also clear the aiCreditsWeekKey so the auto-reset logic grants the new
-- monthly allocation on each user's next credit-consuming action.
ALTER TABLE "User" ALTER COLUMN "aiCredits" SET DEFAULT 30;

UPDATE "User"
SET "aiCredits" = LEAST("aiCredits", 30),
    "aiCreditsWeekKey" = '';
