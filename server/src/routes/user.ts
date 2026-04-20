import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getAICredits } from "../services/aiCredits";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/user/ai-credits
router.get("/ai-credits", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const credits = await getAICredits(prisma, req.auth!.userId);
    // Keep remainingCredits for backwards compat with old client code
    res.json({ ...credits, remainingCredits: credits.totalCredits });
  } catch {
    res.status(500).json({ error: "Failed to load AI credits", code: "INTERNAL_ERROR" });
  }
});

// PUT /api/user/profile
router.put("/profile", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email } = req.body;

    if (!name && !email) {
      res.status(400).json({ error: "Name or email is required", code: "VALIDATION_ERROR" });
      return;
    }

    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email, NOT: { id: req.auth!.userId } },
      });
      if (existing) {
        res.status(409).json({ error: "Email already in use", code: "CONFLICT" });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { ...(name && { name }), ...(email && { email }) },
      select: { id: true, email: true, name: true, createdAt: true, updatedAt: true },
    });

    res.json({ user });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PUT /api/user/password
router.put("/password", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Current and new passwords are required", code: "VALIDATION_ERROR" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters", code: "VALIDATION_ERROR" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
      return;
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      res.status(401).json({ error: "Current password is incorrect", code: "UNAUTHORIZED" });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { password: hashedPassword },
    });

    res.json({ message: "Password updated successfully" });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/user/language — persist UI locale on the user profile
router.patch("/language", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lang = String(req.body?.language || "").trim().toLowerCase();
    if (lang !== "en" && lang !== "ar") {
      res.status(400).json({ error: "language must be 'en' or 'ar'", code: "VALIDATION_ERROR" });
      return;
    }
    await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { language: lang },
    });
    res.json({ language: lang });
  } catch {
    res.status(500).json({ error: "Failed to save language", code: "INTERNAL_ERROR" });
  }
});

export default router;
