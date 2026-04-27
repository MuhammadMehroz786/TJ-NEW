import { Router, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// Every admin endpoint requires auth + ADMIN role
router.use(authenticate);
router.use(requireRole("ADMIN"));

// ── GET /api/admin/overview — dashboard stats ─────────────────────────────────
router.get("/overview", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);

    const [
      totalUsers,
      merchantCount,
      creatorCount,
      newUsers24h,
      newUsers7d,
      totalRevenueResult,
      monthRevenueResult,
      completedPurchases,
      pendingPurchases,
      totalEnhancements,
      enhancements7d,
      whatsappSessions,
      verifiedWhatsappSessions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "MERCHANT" } }),
      prisma.user.count({ where: { role: "CREATOR" } }),
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.creditPurchase.aggregate({ where: { status: "COMPLETED" }, _sum: { amount: true, credits: true } }),
      prisma.creditPurchase.aggregate({ where: { status: "COMPLETED", createdAt: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.creditPurchase.count({ where: { status: "COMPLETED" } }),
      prisma.creditPurchase.count({ where: { status: "PENDING" } }),
      prisma.aiStudioImage.count(),
      prisma.aiStudioImage.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.whatsAppSession.count(),
      prisma.whatsAppSession.count({ where: { isVerified: true } }),
    ]);

    res.json({
      users: {
        total: totalUsers,
        merchants: merchantCount,
        creators: creatorCount,
        newLast24h: newUsers24h,
        newLast7d: newUsers7d,
      },
      revenue: {
        totalUsd: Number(totalRevenueResult._sum.amount || 0),
        totalCreditsSold: totalRevenueResult._sum.credits || 0,
        thisMonthUsd: Number(monthRevenueResult._sum.amount || 0),
        completedPurchases,
        pendingPurchases,
      },
      aiStudio: {
        totalEnhancements,
        enhancementsLast7d: enhancements7d,
      },
      whatsapp: {
        totalSessions: whatsappSessions,
        verifiedSessions: verifiedWhatsappSessions,
      },
    });
  } catch (err) {
    console.error("[admin] overview error:", err);
    res.status(500).json({ error: "Failed to load overview", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/admin/users — paginated user list with search ────────────────────
router.get("/users", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || "25", 10)));
    const search = String(req.query.search || "").trim();
    const role = String(req.query.role || "").trim().toUpperCase();

    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }
    if (role === "MERCHANT" || role === "CREATOR" || role === "ADMIN") {
      where.role = role as "MERCHANT" | "CREATOR" | "ADMIN";
    }

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, email: true, name: true, role: true,
          aiCredits: true, purchasedCredits: true,
          createdAt: true, updatedAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ data, total, page, pageSize });
  } catch (err) {
    console.error("[admin] users list error:", err);
    res.status(500).json({ error: "Failed to load users", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/admin/users/:id — full user detail ───────────────────────────────
router.get("/users/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, role: true,
        aiCredits: true, aiCreditsWeekKey: true, purchasedCredits: true,
        createdAt: true, updatedAt: true,
        _count: {
          select: {
            whatsappSessions: true,
            creditPurchases: true,
          },
        },
      },
    });
    if (!user) {
      res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
      return;
    }

    const [purchases, whatsappSessions, imageCount, productCount] = await Promise.all([
      prisma.creditPurchase.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, credits: true, amount: true, status: true,
          stripeSessionId: true, createdAt: true,
        },
      }),
      prisma.whatsAppSession.findMany({
        where: { userId: id },
        select: {
          id: true, phoneNumber: true, isVerified: true, state: true,
          creditsUsed: true, creditsLimit: true, lastMessageAt: true,
        },
      }),
      prisma.aiStudioImage.count({ where: { userId: id } }),
      prisma.product.count({ where: { userId: id } }),
    ]);

    res.json({ user, purchases, whatsappSessions, imageCount, productCount });
  } catch (err) {
    console.error("[admin] user detail error:", err);
    res.status(500).json({ error: "Failed to load user", code: "INTERNAL_ERROR" });
  }
});

// ── POST /api/admin/users/:id/grant-credits ───────────────────────────────────
// Manually add credits to a user's purchased pool — for comps, apologies, testing.
// Records as a CreditPurchase with a synthetic stripeSessionId + amount=0 so the
// audit trail preserves who granted what.
router.post("/users/:id/grant-credits", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const raw = req.body?.credits;
    const note = String(req.body?.note || "").trim().slice(0, 200);
    const credits = Number(raw);
    if (!Number.isInteger(credits) || credits <= 0 || credits > 10000) {
      res.status(400).json({ error: "credits must be a positive integer up to 10,000", code: "VALIDATION_ERROR" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
      return;
    }

    const actorId = req.auth!.userId;
    const sessionKey = `admin_grant_${Date.now()}_${actorId}_${id}`;

    await prisma.$transaction(async (tx) => {
      await tx.creditPurchase.create({
        data: {
          userId: id,
          credits,
          amount: 0,
          stripeSessionId: sessionKey,
          status: "COMPLETED",
        },
      });
      await tx.user.update({
        where: { id },
        data: { purchasedCredits: { increment: credits } },
      });
    });

    console.log(`[admin] ${req.auth!.email} granted ${credits} credits to ${user.email} (note: ${note || "none"})`);

    const updated = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, aiCredits: true, purchasedCredits: true },
    });
    res.json({ granted: credits, user: updated });
  } catch (err) {
    console.error("[admin] grant credits error:", err);
    res.status(500).json({ error: "Failed to grant credits", code: "INTERNAL_ERROR" });
  }
});

// ── PATCH /api/admin/users/:id/role ───────────────────────────────────────────
// Promote/demote a user. Admins cannot demote themselves (lock-out protection).
router.patch("/users/:id/role", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const role = String(req.body?.role || "").trim().toUpperCase();
    if (!["MERCHANT", "CREATOR", "ADMIN"].includes(role)) {
      res.status(400).json({ error: "role must be MERCHANT, CREATOR, or ADMIN", code: "VALIDATION_ERROR" });
      return;
    }
    if (id === req.auth!.userId && role !== "ADMIN") {
      res.status(400).json({ error: "You can't demote yourself", code: "SELF_DEMOTE" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
      return;
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { role: role as "MERCHANT" | "CREATOR" | "ADMIN" },
      select: { id: true, email: true, role: true },
    });
    console.log(`[admin] ${req.auth!.email} changed role of ${updated.email} → ${role}`);
    res.json(updated);
  } catch (err) {
    console.error("[admin] role change error:", err);
    res.status(500).json({ error: "Failed to change role", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/admin/timeseries — daily counts for the last N days ──────────────
// Returns signups, enhancements, revenue ($), credits spent per day. Used for
// admin dashboard line charts. Days are UTC-based and go back `days` days.
router.get("/timeseries", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const days = Math.min(90, Math.max(1, parseInt((req.query.days as string) || "30", 10)));
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1));

    // Raw group-by-day for each metric, using Prisma $queryRaw for date_trunc
    const signupsRaw = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "User"
      WHERE "createdAt" >= ${start}
      GROUP BY 1 ORDER BY 1 ASC`;
    const enhancementsRaw = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "AiStudioImage"
      WHERE "createdAt" >= ${start}
      GROUP BY 1 ORDER BY 1 ASC`;
    const revenueRaw = await prisma.$queryRaw<{ day: Date; revenue: number; credits: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             COALESCE(SUM("amount")::float, 0) AS revenue,
             COALESCE(SUM("credits"), 0)::bigint AS credits
      FROM "CreditPurchase"
      WHERE "createdAt" >= ${start} AND "status" = 'COMPLETED'
      GROUP BY 1 ORDER BY 1 ASC`;

    // Build a dense series (zero-filled) so charts render smoothly
    const byDay: Record<string, { day: string; signups: number; enhancements: number; revenue: number; creditsSold: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = { day: key, signups: 0, enhancements: 0, revenue: 0, creditsSold: 0 };
    }
    for (const r of signupsRaw) {
      const k = new Date(r.day).toISOString().slice(0, 10);
      if (byDay[k]) byDay[k].signups = Number(r.count);
    }
    for (const r of enhancementsRaw) {
      const k = new Date(r.day).toISOString().slice(0, 10);
      if (byDay[k]) byDay[k].enhancements = Number(r.count);
    }
    for (const r of revenueRaw) {
      const k = new Date(r.day).toISOString().slice(0, 10);
      if (byDay[k]) {
        byDay[k].revenue = Number(r.revenue);
        byDay[k].creditsSold = Number(r.credits);
      }
    }

    res.json({ days, series: Object.values(byDay) });
  } catch (err) {
    console.error("[admin] timeseries error:", err);
    res.status(500).json({ error: "Failed to load timeseries", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/admin/active-users — DAU / WAU / MAU ─────────────────────────────
// "Active" = user who enhanced an image OR made a completed purchase in window
router.get("/active-users", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = Date.now();
    const windows: { name: "dau" | "wau" | "mau"; ms: number }[] = [
      { name: "dau", ms: 24 * 60 * 60 * 1000 },
      { name: "wau", ms: 7 * 24 * 60 * 60 * 1000 },
      { name: "mau", ms: 30 * 24 * 60 * 60 * 1000 },
    ];
    const out: Record<string, number> = {};
    for (const w of windows) {
      const since = new Date(now - w.ms);
      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT u.id)::bigint AS count
        FROM "User" u
        WHERE EXISTS (SELECT 1 FROM "AiStudioImage" i WHERE i."userId" = u.id AND i."createdAt" >= ${since})
           OR EXISTS (SELECT 1 FROM "CreditPurchase" p WHERE p."userId" = u.id AND p."createdAt" >= ${since} AND p."status" = 'COMPLETED')`;
      out[w.name] = Number(rows[0]?.count || 0);
    }
    res.json(out);
  } catch (err) {
    console.error("[admin] active-users error:", err);
    res.status(500).json({ error: "Failed to load active users", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/admin/top-users — by credits spent (via enhancements) ────────────
router.get("/top-users", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "10", 10)));
    const rows = await prisma.$queryRaw<
      { id: string; email: string; name: string; role: string; enhancements: bigint; revenue: number; credits_bought: bigint }[]
    >`
      SELECT u.id, u.email, u.name, u.role::text,
        (SELECT COUNT(*) FROM "AiStudioImage" i WHERE i."userId" = u.id)::bigint AS enhancements,
        COALESCE((SELECT SUM("amount")::float FROM "CreditPurchase" p WHERE p."userId" = u.id AND p."status" = 'COMPLETED'), 0) AS revenue,
        COALESCE((SELECT SUM("credits") FROM "CreditPurchase" p WHERE p."userId" = u.id AND p."status" = 'COMPLETED'), 0)::bigint AS credits_bought
      FROM "User" u
      WHERE u.role != 'ADMIN'
      ORDER BY enhancements DESC, revenue DESC
      LIMIT ${limit}`;

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        enhancements: Number(r.enhancements),
        revenueUsd: Number(r.revenue),
        creditsBought: Number(r.credits_bought),
      })),
    });
  } catch (err) {
    console.error("[admin] top-users error:", err);
    res.status(500).json({ error: "Failed to load top users", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/admin/funnel — signup → enhance → purchase → WhatsApp link ───────
router.get("/funnel", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [signed, enhanced, purchased, waLinked] = await Promise.all([
      prisma.user.count({ where: { role: { in: ["MERCHANT", "CREATOR"] } } }),
      prisma.user.count({ where: { role: { in: ["MERCHANT", "CREATOR"] }, aiStudioImages: { some: {} } } }),
      prisma.user.count({ where: { role: { in: ["MERCHANT", "CREATOR"] }, creditPurchases: { some: { status: "COMPLETED" } } } }),
      prisma.user.count({ where: { role: { in: ["MERCHANT", "CREATOR"] }, whatsappSessions: { some: { isVerified: true } } } }),
    ]);
    res.json({
      signed,
      enhanced,
      purchased,
      waLinked,
      enhancedRate: signed ? enhanced / signed : 0,
      purchasedRate: signed ? purchased / signed : 0,
      waLinkedRate: signed ? waLinked / signed : 0,
    });
  } catch (err) {
    console.error("[admin] funnel error:", err);
    res.status(500).json({ error: "Failed to load funnel", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/admin/whatsapp-stats — session breakdown ─────────────────────────
router.get("/whatsapp-stats", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, verified, exhausted, activeLast24h, byState] = await Promise.all([
      prisma.whatsAppSession.count(),
      prisma.whatsAppSession.count({ where: { isVerified: true } }),
      prisma.whatsAppSession.count({ where: { state: "exhausted" } }),
      prisma.whatsAppSession.count({ where: { lastMessageAt: { gte: dayAgo } } }),
      prisma.$queryRaw<{ state: string; count: bigint }[]>`
        SELECT state, COUNT(*)::bigint AS count FROM "WhatsAppSession" GROUP BY 1 ORDER BY 2 DESC`,
    ]);
    res.json({
      total,
      verified,
      guest: total - verified,
      exhausted,
      activeLast24h,
      byState: byState.map((r) => ({ state: r.state, count: Number(r.count) })),
    });
  } catch (err) {
    console.error("[admin] whatsapp-stats error:", err);
    res.status(500).json({ error: "Failed to load WhatsApp stats", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/admin/system-health — uptime, memory, recent errors ──────────────
router.get("/system-health", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const mem = process.memoryUsage();
    const db = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM pg_stat_activity WHERE datname = current_database()`;
    res.json({
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      },
      db: { connections: Number(db[0]?.count || 0) },
      nodeVersion: process.version,
    });
  } catch (err) {
    console.error("[admin] system-health error:", err);
    res.status(500).json({ error: "Failed to load system health", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/admin/purchases — recent purchases across all users ──────────────
router.get("/purchases", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || "25", 10)));
    const status = String(req.query.status || "").trim().toUpperCase();

    const where: Prisma.CreditPurchaseWhereInput = {};
    if (status === "COMPLETED" || status === "PENDING" || status === "REFUNDED") {
      where.status = status as "COMPLETED" | "PENDING" | "REFUNDED";
    }

    const [data, total] = await Promise.all([
      prisma.creditPurchase.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.creditPurchase.count({ where }),
    ]);

    res.json({ data, total, page, pageSize });
  } catch (err) {
    console.error("[admin] purchases error:", err);
    res.status(500).json({ error: "Failed to load purchases", code: "INTERNAL_ERROR" });
  }
});

// ── AI Credit Codes ──────────────────────────────────────────────────────────
// Admin-issued codes that grant AI credits when redeemed by a merchant on the
// Billing page. Distinct from `PromoCode` (merchant-issued storefront discounts).

// GET /api/admin/ai-credit-codes — list codes with redemption counts
router.get("/ai-credit-codes", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const codes = await prisma.aiCreditCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { redemptions: true } } },
    });
    res.json({
      data: codes.map((c) => ({
        id: c.id,
        code: c.code,
        credits: c.credits,
        maxRedemptions: c.maxRedemptions,
        expiresAt: c.expiresAt,
        isActive: c.isActive,
        note: c.note,
        createdBy: c.createdBy,
        createdAt: c.createdAt,
        redemptionCount: c._count.redemptions,
      })),
    });
  } catch (err) {
    console.error("[admin] list ai-credit-codes error:", err);
    res.status(500).json({ error: "Failed to load codes", code: "INTERNAL_ERROR" });
  }
});

// POST /api/admin/ai-credit-codes — create a code
// Body: { code, credits, maxRedemptions?, expiresAt?, note? }
router.post("/ai-credit-codes", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      code?: unknown; credits?: unknown; maxRedemptions?: unknown;
      expiresAt?: unknown; note?: unknown;
    };

    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code || code.length < 3 || code.length > 40 || !/^[A-Z0-9_-]+$/.test(code)) {
      res.status(400).json({ error: "code must be 3–40 chars, A–Z, 0–9, _ or -", code: "VALIDATION_ERROR" });
      return;
    }

    const credits = typeof body.credits === "number" ? body.credits : NaN;
    if (!Number.isInteger(credits) || credits < 1 || credits > 100000) {
      res.status(400).json({ error: "credits must be an integer between 1 and 100000", code: "VALIDATION_ERROR" });
      return;
    }

    let maxRedemptions: number | null = null;
    if (body.maxRedemptions !== undefined && body.maxRedemptions !== null) {
      const n = Number(body.maxRedemptions);
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        res.status(400).json({ error: "maxRedemptions must be a positive integer or null", code: "VALIDATION_ERROR" });
        return;
      }
      maxRedemptions = n;
    }

    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const d = new Date(String(body.expiresAt));
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "expiresAt must be a valid date", code: "VALIDATION_ERROR" });
        return;
      }
      expiresAt = d;
    }

    const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : null;

    try {
      const created = await prisma.aiCreditCode.create({
        data: {
          code,
          credits,
          maxRedemptions,
          expiresAt,
          note: note || null,
          createdBy: req.auth!.userId,
        },
      });
      res.status(201).json(created);
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        res.status(409).json({ error: "Code already exists", code: "CONFLICT" });
        return;
      }
      throw e;
    }
  } catch (err) {
    console.error("[admin] create ai-credit-code error:", err);
    res.status(500).json({ error: "Failed to create code", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/admin/ai-credit-codes/:id — toggle isActive or update note/expiry
router.patch("/ai-credit-codes/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = req.body as { isActive?: unknown; note?: unknown; expiresAt?: unknown };
    const data: { isActive?: boolean; note?: string | null; expiresAt?: Date | null } = {};

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        res.status(400).json({ error: "isActive must be a boolean", code: "VALIDATION_ERROR" });
        return;
      }
      data.isActive = body.isActive;
    }
    if (body.note !== undefined) {
      data.note = body.note === null ? null : String(body.note).trim().slice(0, 200) || null;
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null) {
        data.expiresAt = null;
      } else {
        const d = new Date(String(body.expiresAt));
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: "expiresAt must be a valid date", code: "VALIDATION_ERROR" });
          return;
        }
        data.expiresAt = d;
      }
    }

    const updated = await prisma.aiCreditCode.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      res.status(404).json({ error: "Code not found", code: "NOT_FOUND" });
      return;
    }
    console.error("[admin] update ai-credit-code error:", err);
    res.status(500).json({ error: "Failed to update code", code: "INTERNAL_ERROR" });
  }
});

// GET /api/admin/ai-credit-codes/:id/redemptions — see who used a code
router.get("/ai-credit-codes/:id/redemptions", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const redemptions = await prisma.aiCreditCodeRedemption.findMany({
      where: { codeId: req.params.id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, email: true, name: true } } },
      take: 200,
    });
    res.json({ data: redemptions });
  } catch (err) {
    console.error("[admin] redemptions error:", err);
    res.status(500).json({ error: "Failed to load redemptions", code: "INTERNAL_ERROR" });
  }
});

export default router;
