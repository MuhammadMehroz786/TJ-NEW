import { PrismaClient } from "@prisma/client";

export const WEEKLY_AI_CREDITS = 50;

function getMondayKeyUTC(date = new Date()): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay(); // 0=Sun, 1=Mon
  const diffToMonday = (day + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - diffToMonday);
  return utcDate.toISOString().slice(0, 10);
}

export class AICreditError extends Error {
  code = "AI_CREDITS_EXHAUSTED";
  status = 403;
  constructor(message = "AI credits exhausted. Purchase more credits or wait for your weekly reset on Monday.") {
    super(message);
  }
}

/**
 * Consume 1 credit with priority drain:
 *   1. Weekly free credits (aiCredits) drain first
 *   2. Purchased credits (purchasedCredits) drain after weekly is 0
 * Weekly credits auto-reset to 50 on a new week — purchased credits are NEVER reset.
 */
export async function consumeWeeklyAICredit(
  prisma: PrismaClient,
  userId: string
): Promise<{ weeklyCredits: number; purchasedCredits: number; totalCredits: number; resetWeek: string }> {
  const currentWeekKey = getMondayKeyUTC();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, aiCredits: true, aiCreditsWeekKey: true, purchasedCredits: true },
    });

    if (!user) throw new Error("User not found");

    // Auto-reset weekly credits if it's a new week (purchased credits untouched)
    let weeklyCredits = user.aiCredits;
    if (user.aiCreditsWeekKey !== currentWeekKey) {
      const reset = await tx.user.update({
        where: { id: userId },
        data: { aiCredits: WEEKLY_AI_CREDITS, aiCreditsWeekKey: currentWeekKey },
        select: { aiCredits: true },
      });
      weeklyCredits = reset.aiCredits;
    }

    const purchasedCredits = user.purchasedCredits;
    const totalCredits = weeklyCredits + purchasedCredits;

    if (totalCredits <= 0) throw new AICreditError();

    // Priority: drain weekly first, then purchased
    let updatedWeekly = weeklyCredits;
    let updatedPurchased = purchasedCredits;

    if (weeklyCredits > 0) {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { aiCredits: { decrement: 1 } },
        select: { aiCredits: true, purchasedCredits: true },
      });
      updatedWeekly = updated.aiCredits;
      updatedPurchased = updated.purchasedCredits;
    } else {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { purchasedCredits: { decrement: 1 } },
        select: { aiCredits: true, purchasedCredits: true },
      });
      updatedWeekly = updated.aiCredits;
      updatedPurchased = updated.purchasedCredits;
    }

    return {
      weeklyCredits: updatedWeekly,
      purchasedCredits: updatedPurchased,
      totalCredits: updatedWeekly + updatedPurchased,
      resetWeek: currentWeekKey,
    };
  });
}

/**
 * Get current credit balance without consuming any.
 * Also auto-resets weekly credits if a new week has started.
 */
export async function getAICredits(
  prisma: PrismaClient,
  userId: string
): Promise<{ weeklyCredits: number; purchasedCredits: number; totalCredits: number; resetWeek: string }> {
  const currentWeekKey = getMondayKeyUTC();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, aiCredits: true, aiCreditsWeekKey: true, purchasedCredits: true },
    });

    if (!user) throw new Error("User not found");

    let weeklyCredits = user.aiCredits;
    if (user.aiCreditsWeekKey !== currentWeekKey) {
      const reset = await tx.user.update({
        where: { id: userId },
        data: { aiCredits: WEEKLY_AI_CREDITS, aiCreditsWeekKey: currentWeekKey },
        select: { aiCredits: true },
      });
      weeklyCredits = reset.aiCredits;
    }

    return {
      weeklyCredits,
      purchasedCredits: user.purchasedCredits,
      totalCredits: weeklyCredits + user.purchasedCredits,
      resetWeek: currentWeekKey,
    };
  });
}

// Keep legacy export for backwards compatibility with existing callers
export const getWeeklyAICredits = async (
  prisma: PrismaClient,
  userId: string
): Promise<{ remainingCredits: number; resetWeek: string }> => {
  const result = await getAICredits(prisma, userId);
  return { remainingCredits: result.totalCredits, resetWeek: result.resetWeek };
};
