import { PrismaClient } from "@prisma/client";

// 30 free AI credits per calendar month. Purchased credits are separate and
// never expire — they kick in once the monthly pool is drained.
export const WEEKLY_AI_CREDITS = 30;
export const MONTHLY_AI_CREDITS = 30;

// Returns "YYYY-MM" for the current calendar month in UTC. We keep the DB
// column named `aiCreditsWeekKey` for backward-compatibility with migrations,
// but it now stores a month key. The value comparison is still a simple
// string-equality check, so the rename is purely cosmetic.
function getMonthKeyUTC(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export class AICreditError extends Error {
  code = "AI_CREDITS_EXHAUSTED";
  status = 403;
  constructor(message = "AI credits exhausted. Purchase more credits or wait for your monthly reset on the 1st.") {
    super(message);
  }
}

/**
 * Consume 1 credit with priority drain:
 *   1. Free monthly credits (aiCredits) drain first
 *   2. Purchased credits (purchasedCredits) drain after monthly is 0
 * Monthly credits auto-reset to 30 on the 1st of each month — purchased
 * credits are NEVER reset.
 *
 * Note: the DB column is named `aiCreditsWeekKey` for historical reasons,
 * and the return field is `weeklyCredits` — both really hold monthly state
 * now. Callers haven't been renamed to avoid churning every feature.
 */
export type CreditPool = "weekly" | "purchased";

export async function consumeWeeklyAICredit(
  prisma: PrismaClient,
  userId: string
): Promise<{ weeklyCredits: number; purchasedCredits: number; totalCredits: number; resetWeek: string; usedPool: CreditPool }> {
  const currentWeekKey = getMonthKeyUTC();

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
    let usedPool: CreditPool;

    if (weeklyCredits > 0) {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { aiCredits: { decrement: 1 } },
        select: { aiCredits: true, purchasedCredits: true },
      });
      updatedWeekly = updated.aiCredits;
      updatedPurchased = updated.purchasedCredits;
      usedPool = "weekly";
    } else {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { purchasedCredits: { decrement: 1 } },
        select: { aiCredits: true, purchasedCredits: true },
      });
      updatedWeekly = updated.aiCredits;
      updatedPurchased = updated.purchasedCredits;
      usedPool = "purchased";
    }

    return {
      weeklyCredits: updatedWeekly,
      purchasedCredits: updatedPurchased,
      totalCredits: updatedWeekly + updatedPurchased,
      resetWeek: currentWeekKey,
      usedPool,
    };
  });
}

/**
 * Refund 1 credit back to the pool it was drained from.
 * Use this when an operation that consumed a credit fails partway through
 * (e.g. Gemini rejects the image). Best-effort: logs on failure but doesn't throw.
 */
export async function refundOneCredit(
  prisma: PrismaClient,
  userId: string,
  pool: CreditPool,
): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: pool === "weekly"
        ? { aiCredits: { increment: 1 } }
        : { purchasedCredits: { increment: 1 } },
    });
  } catch (err) {
    console.error(`Failed to refund credit (pool=${pool}, userId=${userId}):`, err);
  }
}

/**
 * Get current credit balance without consuming any.
 * Also auto-resets weekly credits if a new week has started.
 */
export async function getAICredits(
  prisma: PrismaClient,
  userId: string
): Promise<{ weeklyCredits: number; purchasedCredits: number; totalCredits: number; resetWeek: string }> {
  const currentWeekKey = getMonthKeyUTC();

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
