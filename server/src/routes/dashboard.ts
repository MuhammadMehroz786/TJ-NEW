import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/dashboard/stats
router.get("/stats", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.auth!.userId;
    const role = req.auth!.role;

    if (role === "CREATOR") {
      const [activeCampaigns, completedCampaigns, pendingRequests, earnings, recentCampaigns] = await Promise.all([
        prisma.campaign.count({ where: { creatorId: userId, status: { in: ["IN_PROGRESS", "SUBMITTED"] } } }),
        prisma.campaign.count({ where: { creatorId: userId, status: "COMPLETED" } }),
        prisma.campaign.count({ where: { creatorId: userId, status: "PENDING" } }),
        prisma.payment.aggregate({
          where: { campaign: { creatorId: userId }, status: "RELEASED" },
          _sum: { amount: true },
        }),
        prisma.campaign.findMany({
          where: { creatorId: userId },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            product: { select: { title: true, images: true } },
            merchant: { select: { name: true } },
          },
        }),
      ]);

      res.json({
        activeCampaigns,
        completedCampaigns,
        pendingRequests,
        totalEarnings: earnings._sum.amount || 0,
        recentCampaigns: recentCampaigns.map((c) => ({
          id: c.id,
          productTitle: c.product.title,
          merchantName: c.merchant.name,
          status: c.status,
          amount: c.amount,
          createdAt: c.createdAt,
        })),
      });
    } else {
      const [totalProducts, activeProducts, draftProducts, archivedProducts, connectedMarketplaces, activeCampaigns, recentProducts] =
        await Promise.all([
          prisma.product.count({ where: { userId } }),
          prisma.product.count({ where: { userId, status: "ACTIVE" } }),
          prisma.product.count({ where: { userId, status: "DRAFT" } }),
          prisma.product.count({ where: { userId, status: "ARCHIVED" } }),
          prisma.marketplaceConnection.count({ where: { userId, status: "CONNECTED" } }),
          prisma.campaign.count({ where: { merchantId: userId, status: { notIn: ["COMPLETED", "DECLINED"] } } }),
          prisma.product.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 10,
            select: { title: true, status: true, updatedAt: true, createdAt: true },
          }),
        ]);

      res.json({
        totalProducts,
        activeProducts,
        draftProducts,
        archivedProducts,
        connectedMarketplaces,
        activeCampaigns,
        recentActivity: recentProducts.map((p) => ({
          type: p.createdAt.getTime() === p.updatedAt.getTime() ? "product_created" : "product_updated",
          title: p.title,
          timestamp: p.updatedAt.toISOString(),
        })),
      });
    }
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
