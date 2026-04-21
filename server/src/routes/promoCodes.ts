import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/promo-codes — List merchant's promo codes
router.get("/", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const codes = await prisma.promoCode.findMany({
      where: { merchantId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: codes });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/promo-codes — Create a promo code
router.post("/", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, description, discount } = req.body;

    if (!code) {
      res.status(400).json({ error: "code is required", code: "VALIDATION_ERROR" });
      return;
    }

    const existing = await prisma.promoCode.findUnique({
      where: { merchantId_code: { merchantId: req.auth!.userId, code: code.toUpperCase() } },
    });
    if (existing) {
      res.status(409).json({ error: "Promo code already exists", code: "CONFLICT" });
      return;
    }

    const promoCode = await prisma.promoCode.create({
      data: {
        merchantId: req.auth!.userId,
        code: code.toUpperCase(),
        description: description || null,
        discount: discount || null,
      },
    });

    res.status(201).json(promoCode);
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PUT /api/promo-codes/:id — Update a promo code
router.put("/:id", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.promoCode.findFirst({
      where: { id: req.params.id, merchantId: req.auth!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Promo code not found", code: "NOT_FOUND" });
      return;
    }

    const { code, description, discount, isActive } = req.body;

    if (code) {
      const conflict = await prisma.promoCode.findUnique({
        where: { merchantId_code: { merchantId: req.auth!.userId, code: code.toUpperCase() } },
      });
      if (conflict && conflict.id !== req.params.id) {
        res.status(409).json({ error: "Promo code already exists", code: "CONFLICT" });
        return;
      }
    }

    const promoCode = await prisma.promoCode.update({
      where: { id: req.params.id },
      data: {
        ...(code && { code: code.toUpperCase() }),
        ...(description !== undefined && { description }),
        ...(discount !== undefined && { discount }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json(promoCode);
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// DELETE /api/promo-codes/:id — Delete a promo code
router.delete("/:id", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.promoCode.findFirst({
      where: { id: req.params.id, merchantId: req.auth!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Promo code not found", code: "NOT_FOUND" });
      return;
    }

    await prisma.promoCode.delete({ where: { id: req.params.id } });
    res.json({ message: "Promo code deleted" });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
