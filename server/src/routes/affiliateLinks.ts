import { Router, Response, Request } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

function generateSlug(): string {
  return crypto.randomBytes(4).toString("hex");
}

// GET /api/affiliate-links — List creator's affiliate links
router.get("/", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const links = await prisma.affiliateLink.findMany({
      where: { creatorId: req.auth!.userId },
      include: {
        product: { select: { id: true, title: true, images: true, price: true, currency: true } },
        _count: { select: { clicks: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: links });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/affiliate-links — Create affiliate link for a product
router.post("/", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId, targetUrl } = req.body;

    if (!productId || !targetUrl) {
      res.status(400).json({ error: "productId and targetUrl are required", code: "VALIDATION_ERROR" });
      return;
    }

    // Prevent open-redirect / phishing / javascript: URLs — only http(s) allowed.
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      res.status(400).json({ error: "targetUrl must be a valid URL", code: "VALIDATION_ERROR" });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      res.status(400).json({ error: "targetUrl must use http or https", code: "VALIDATION_ERROR" });
      return;
    }

    // Creators can only link to ACTIVE products that merchants have explicitly
    // made available. No DRAFT/ARCHIVED access even if the creator knows the ID.
    const product = await prisma.product.findFirst({
      where: { id: productId, status: "ACTIVE" },
    });
    if (!product) {
      res.status(404).json({ error: "Product not found or not available", code: "NOT_FOUND" });
      return;
    }

    const existing = await prisma.affiliateLink.findUnique({
      where: { creatorId_productId: { creatorId: req.auth!.userId, productId } },
    });
    if (existing) {
      res.status(409).json({ error: "Affiliate link already exists for this product", code: "CONFLICT" });
      return;
    }

    const link = await prisma.affiliateLink.create({
      data: {
        creatorId: req.auth!.userId,
        productId,
        slug: generateSlug(),
        targetUrl,
      },
      include: {
        product: { select: { id: true, title: true, images: true, price: true, currency: true } },
        _count: { select: { clicks: true } },
      },
    });

    res.status(201).json(link);
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// DELETE /api/affiliate-links/:id — Delete an affiliate link
router.delete("/:id", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.affiliateLink.findFirst({
      where: { id: req.params.id, creatorId: req.auth!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Affiliate link not found", code: "NOT_FOUND" });
      return;
    }

    await prisma.affiliateLink.delete({ where: { id: req.params.id } });
    res.json({ message: "Affiliate link deleted" });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /track/:slug — Public redirect endpoint (tracks clicks)
// Mounted at /api/affiliate-links, so full path is /api/affiliate-links/track/:slug
router.get("/track/:slug", async (req: Request, res: Response): Promise<void> => {
  try {
    const link = await prisma.affiliateLink.findUnique({
      where: { slug: req.params.slug },
    });

    if (!link) {
      res.status(404).json({ error: "Link not found" });
      return;
    }

    await prisma.click.create({
      data: {
        affiliateLinkId: link.id,
        ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip || null,
        userAgent: req.headers["user-agent"] || null,
        referer: req.headers["referer"] || null,
      },
    });

    // Defense-in-depth: re-check scheme at redirect time, even though /create
    // validates it. Legacy rows created before validation are protected here.
    try {
      const u = new URL(link.targetUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        res.status(400).json({ error: "Link has an unsafe target URL" });
        return;
      }
    } catch {
      res.status(400).json({ error: "Link has an invalid target URL" });
      return;
    }
    res.redirect(302, link.targetUrl);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/affiliate-links/:id/clicks — Get click stats for a link
router.get("/:id/clicks", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const link = await prisma.affiliateLink.findFirst({
      where: { id: req.params.id, creatorId: req.auth!.userId },
    });
    if (!link) {
      res.status(404).json({ error: "Affiliate link not found", code: "NOT_FOUND" });
      return;
    }

    const totalClicks = await prisma.click.count({
      where: { affiliateLinkId: link.id },
    });

    const last7Days = await prisma.click.count({
      where: {
        affiliateLinkId: link.id,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    const last24Hours = await prisma.click.count({
      where: {
        affiliateLinkId: link.id,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    res.json({ totalClicks, last7Days, last24Hours });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
