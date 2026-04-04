import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/manual-sales — List sales (merchants see their own, creators see attributed to them)
router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const where = req.auth!.role === "MERCHANT"
      ? { merchantId: req.auth!.userId }
      : { creatorId: req.auth!.userId };

    const sales = await prisma.manualSale.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, email: true } },
        merchant: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: sales });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/manual-sales — Merchant attributes a sale to a creator
router.post("/", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { creatorId, productId, orderId, amount, note } = req.body;

    if (!creatorId || !amount) {
      res.status(400).json({ error: "creatorId and amount are required", code: "VALIDATION_ERROR" });
      return;
    }

    const creator = await prisma.user.findFirst({
      where: { id: creatorId, role: "CREATOR" },
    });
    if (!creator) {
      res.status(404).json({ error: "Creator not found", code: "NOT_FOUND" });
      return;
    }

    if (productId) {
      const product = await prisma.product.findFirst({
        where: { id: productId, userId: req.auth!.userId },
      });
      if (!product) {
        res.status(404).json({ error: "Product not found", code: "NOT_FOUND" });
        return;
      }
    }

    const sale = await prisma.manualSale.create({
      data: {
        merchantId: req.auth!.userId,
        creatorId,
        productId: productId || null,
        orderId: orderId || null,
        amount: parseFloat(amount),
        note: note || null,
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, title: true } },
      },
    });

    res.status(201).json(sale);
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// DELETE /api/manual-sales/:id — Delete a manual sale
router.delete("/:id", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.manualSale.findFirst({
      where: { id: req.params.id, merchantId: req.auth!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Sale not found", code: "NOT_FOUND" });
      return;
    }

    await prisma.manualSale.delete({ where: { id: req.params.id } });
    res.json({ message: "Sale deleted" });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
