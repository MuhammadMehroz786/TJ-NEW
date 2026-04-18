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

export default router;
