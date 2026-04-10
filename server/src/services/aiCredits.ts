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
  constructor(message = "AI credits exhausted. Credits reset every Monday.") {
    super(message);
  }
}

export async function consumeWeeklyAICredit(prisma: PrismaClient, userId: string): Promise<{ remainingCredits: number; resetWeek: string }> {
  const currentWeekKey = getMondayKeyUTC();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, aiCredits: true, aiCreditsWeekKey: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    let credits = user.aiCredits;
    if (user.aiCreditsWeekKey !== currentWeekKey) {
      const reset = await tx.user.update({
        where: { id: userId },
        data: { aiCredits: WEEKLY_AI_CREDITS, aiCreditsWeekKey: currentWeekKey },
        select: { aiCredits: true },
      });
      credits = reset.aiCredits;
    }

    if (credits <= 0) {
      throw new AICreditError();
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { aiCredits: { decrement: 1 } },
      select: { aiCredits: true },
    });

    return { remainingCredits: updated.aiCredits, resetWeek: currentWeekKey };
  });
}

export async function getWeeklyAICredits(prisma: PrismaClient, userId: string): Promise<{ remainingCredits: number; resetWeek: string }> {
  const currentWeekKey = getMondayKeyUTC();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, aiCredits: true, aiCreditsWeekKey: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.aiCreditsWeekKey !== currentWeekKey) {
      const reset = await tx.user.update({
        where: { id: userId },
        data: { aiCredits: WEEKLY_AI_CREDITS, aiCreditsWeekKey: currentWeekKey },
        select: { aiCredits: true },
      });
      return { remainingCredits: reset.aiCredits, resetWeek: currentWeekKey };
    }

    return { remainingCredits: user.aiCredits, resetWeek: currentWeekKey };
  });
}
