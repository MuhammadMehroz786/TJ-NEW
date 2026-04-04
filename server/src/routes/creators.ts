import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/creators — Browse available creators (merchant-only)
router.get("/", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { niche, sort = "followers", page = "1", limit = "20" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * pageSize;

    const where: Record<string, unknown> = {
      isAvailable: true,
      displayName: { not: "" },
      niche: { not: "" },
      rate: { gt: 0 },
    };

    if (niche && niche !== "all") {
      where.niche = niche;
    }

    const [profiles, total] = await Promise.all([
      prisma.creatorProfile.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
          },
        },
      }),
      prisma.creatorProfile.count({ where }),
    ]);

    const creatorIds = profiles.map((p) => p.userId);
    const campaignCounts = await prisma.campaign.groupBy({
      by: ["creatorId"],
      where: { creatorId: { in: creatorIds }, status: "COMPLETED" },
      _count: { id: true },
    });
    const countMap = new Map(campaignCounts.map((c) => [c.creatorId, c._count.id]));

    let results = profiles.map((p) => ({
      id: p.id,
      userId: p.userId,
      displayName: p.displayName,
      bio: p.bio,
      profilePhoto: p.profilePhoto,
      niche: p.niche,
      rate: p.rate,
      socialPlatforms: p.socialPlatforms,
      portfolioLinks: p.portfolioLinks,
      isAvailable: p.isAvailable,
      completedCampaigns: countMap.get(p.userId) || 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    if (sort === "followers") {
      results.sort((a, b) => {
        const maxA = Math.max(0, ...(a.socialPlatforms as { followerCount: number }[]).map((s) => s.followerCount));
        const maxB = Math.max(0, ...(b.socialPlatforms as { followerCount: number }[]).map((s) => s.followerCount));
        return maxB - maxA;
      });
    } else if (sort === "rate") {
      results.sort((a, b) => Number(a.rate) - Number(b.rate));
    }

    res.json({ data: results, total, page: pageNum, pageSize });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /api/creators/profile — Get own creator profile
router.get("/profile", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.creatorProfile.findUnique({
      where: { userId: req.auth!.userId },
    });
    res.json({ profile });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PUT /api/creators/profile — Create or update own creator profile
router.put("/profile", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { displayName, bio, profilePhoto, niche, rate, socialPlatforms, portfolioLinks, isAvailable } = req.body;

    if (!displayName || !niche || !rate) {
      res.status(400).json({ error: "displayName, niche, and rate are required", code: "VALIDATION_ERROR" });
      return;
    }

    if (!Array.isArray(socialPlatforms) || socialPlatforms.length === 0) {
      res.status(400).json({ error: "At least one social platform is required", code: "VALIDATION_ERROR" });
      return;
    }

    const validPlatforms = ["instagram", "tiktok", "snapchat", "twitter", "youtube"];
    for (const sp of socialPlatforms) {
      if (!validPlatforms.includes(sp.platform) || !sp.handle || sp.followerCount == null) {
        res.status(400).json({ error: "Each social platform needs a valid platform, handle, and followerCount", code: "VALIDATION_ERROR" });
        return;
      }
    }

    const data = {
      displayName,
      bio: bio || null,
      profilePhoto: profilePhoto || null,
      niche,
      rate: parseFloat(rate),
      socialPlatforms,
      portfolioLinks: portfolioLinks || [],
      isAvailable: isAvailable !== false,
    };

    const profile = await prisma.creatorProfile.upsert({
      where: { userId: req.auth!.userId },
      create: { ...data, userId: req.auth!.userId },
      update: data,
    });

    res.json({ profile });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
