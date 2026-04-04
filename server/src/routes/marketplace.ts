import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/marketplace/products — Creators browse all active merchant products
router.get("/products", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, category, page = "1", limit = "20" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * pageSize;

    const where: Record<string, unknown> = {
      status: "ACTIVE",
    };

    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }

    if (category) {
      where.category = category;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          currency: true,
          images: true,
          category: true,
          tags: true,
          vendor: true,
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Check which products the creator already has affiliate links for
    const existingLinks = await prisma.affiliateLink.findMany({
      where: { creatorId: req.auth!.userId },
      select: { productId: true },
    });
    const linkedProductIds = new Set(existingLinks.map((l) => l.productId));

    const data = products.map((p) => ({
      ...p,
      merchantName: p.user.name,
      hasAffiliateLink: linkedProductIds.has(p.id),
      user: undefined,
    }));

    res.json({ data, total, page: pageNum, pageSize });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /api/marketplace/categories — List all product categories
router.get("/categories", authenticate, requireRole("CREATOR"), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const categories = await prisma.product.findMany({
      where: { status: "ACTIVE", category: { not: null } },
      select: { category: true },
      distinct: ["category"],
    });

    res.json({ data: categories.map((c) => c.category).filter(Boolean) });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
