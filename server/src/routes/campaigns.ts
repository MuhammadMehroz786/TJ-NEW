import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

const campaignInclude = {
  product: true,
  creator: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
  merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
  payment: true,
};

// POST /api/campaigns — Create campaign (merchant-only)
router.post("/", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId, creatorId, brief } = req.body;

    if (!productId || !creatorId || !brief) {
      res.status(400).json({ error: "productId, creatorId, and brief are required", code: "VALIDATION_ERROR" });
      return;
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, userId: req.auth!.userId },
    });
    if (!product) {
      res.status(404).json({ error: "Product not found", code: "NOT_FOUND" });
      return;
    }

    const creatorProfile = await prisma.creatorProfile.findUnique({
      where: { userId: creatorId },
    });
    if (!creatorProfile || !creatorProfile.isAvailable) {
      res.status(404).json({ error: "Creator not found or unavailable", code: "NOT_FOUND" });
      return;
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: {
          merchantId: req.auth!.userId,
          creatorId,
          productId,
          brief,
          amount: creatorProfile.rate,
          status: "PENDING",
        },
      });

      await tx.payment.create({
        data: {
          campaignId: c.id,
          amount: creatorProfile.rate,
          status: "HELD",
        },
      });

      return tx.campaign.findUnique({
        where: { id: c.id },
        include: campaignInclude,
      });
    });

    res.status(201).json({ campaign });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /api/campaigns — List campaigns (both roles)
router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, page = "1", limit = "20" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (req.auth!.role === "MERCHANT") {
      where.merchantId = req.auth!.userId;
    } else {
      where.creatorId = req.auth!.userId;
    }
    if (status) {
      where.status = status;
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: campaignInclude,
      }),
      prisma.campaign.count({ where }),
    ]);

    res.json({ data: campaigns, total, page: pageNum, pageSize });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /api/campaigns/:id — Campaign detail
router.get("/:id", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        ...campaignInclude,
        creator: {
          select: {
            id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true,
            creatorProfile: true,
          },
        },
      },
    });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }

    if (campaign.merchantId !== req.auth!.userId && campaign.creatorId !== req.auth!.userId) {
      res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
      return;
    }

    res.json({ campaign });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/accept — Creator accepts (PENDING → IN_PROGRESS)
router.patch("/:id/accept", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign || campaign.creatorId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }
    if (campaign.status !== "PENDING") {
      res.status(400).json({ error: "Campaign is not pending", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: "IN_PROGRESS" },
      include: campaignInclude,
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/decline — Creator declines (PENDING → DECLINED, refund)
router.patch("/:id/decline", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { payment: true },
    });
    if (!campaign || campaign.creatorId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }
    if (campaign.status !== "PENDING") {
      res.status(400).json({ error: "Campaign is not pending", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (campaign.payment) {
        await tx.payment.update({ where: { id: campaign.payment.id }, data: { status: "REFUNDED" } });
      }
      return tx.campaign.update({
        where: { id: req.params.id },
        data: { status: "DECLINED" },
        include: campaignInclude,
      });
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/submit — Creator submits links (IN_PROGRESS → SUBMITTED)
router.patch("/:id/submit", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { socialLinks } = req.body;
    if (!Array.isArray(socialLinks) || socialLinks.length === 0) {
      res.status(400).json({ error: "At least one social link is required", code: "VALIDATION_ERROR" });
      return;
    }
    for (const link of socialLinks) {
      if (!link.platform || !link.url) {
        res.status(400).json({ error: "Each social link needs a platform and url", code: "VALIDATION_ERROR" });
        return;
      }
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign || campaign.creatorId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }
    if (campaign.status !== "IN_PROGRESS") {
      res.status(400).json({ error: "Campaign is not in progress", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: "SUBMITTED", socialLinks },
      include: campaignInclude,
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/approve — Merchant approves (SUBMITTED → COMPLETED, release payment)
router.patch("/:id/approve", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { payment: true },
    });
    if (!campaign || campaign.merchantId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }
    if (campaign.status !== "SUBMITTED") {
      res.status(400).json({ error: "Campaign is not submitted", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (campaign.payment) {
        await tx.payment.update({ where: { id: campaign.payment.id }, data: { status: "RELEASED" } });
      }
      return tx.campaign.update({
        where: { id: req.params.id },
        data: { status: "COMPLETED" },
        include: campaignInclude,
      });
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/revision — Merchant requests revision (SUBMITTED → IN_PROGRESS)
router.patch("/:id/revision", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { revisionNote } = req.body;
    if (!revisionNote) {
      res.status(400).json({ error: "revisionNote is required", code: "VALIDATION_ERROR" });
      return;
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign || campaign.merchantId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }
    if (campaign.status !== "SUBMITTED") {
      res.status(400).json({ error: "Campaign is not submitted", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: "IN_PROGRESS", revisionNote },
      include: campaignInclude,
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
