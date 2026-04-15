import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getAICredits } from "../services/aiCredits";

const router = Router();
const prisma = new PrismaClient();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

// ── Pricing tiers ────────────────────────────────────────────────────────────
const PRICING_TIERS: { credits: number; priceUsd: number; label: string; tag?: string }[] = [
  { credits: 50,  priceUsd: 4.99,  label: "Starter" },
  { credits: 100, priceUsd: 8.99,  label: "Growth",  tag: "Save 10%" },
  { credits: 250, priceUsd: 19.99, label: "Pro",     tag: "Save 20%" },
  { credits: 500, priceUsd: 34.99, label: "Scale",   tag: "Save 30%" },
];
const CUSTOM_PRICE_PER_CREDIT = 0.10; // $0.10 per credit for custom amounts

function calculatePrice(credits: number): number {
  const tier = PRICING_TIERS.find((t) => t.credits === credits);
  if (tier) return tier.priceUsd;
  // Custom: $0.10 per credit, rounded to 2 decimal places
  return Math.round(credits * CUSTOM_PRICE_PER_CREDIT * 100) / 100;
}

// ── GET /api/credits/balance ─────────────────────────────────────────────────
router.get("/balance", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const balance = await getAICredits(prisma, req.auth!.userId);
    const nextMonday = getNextMondayUTC();
    res.json({ ...balance, nextResetAt: nextMonday.toISOString() });
  } catch {
    res.status(500).json({ error: "Failed to load credit balance", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/credits/history ─────────────────────────────────────────────────
router.get("/history", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const purchases = await prisma.creditPurchase.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        credits: true,
        amount: true,
        status: true,
        stripeSessionId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const total = purchases.reduce((sum, p) => {
      return p.status === "COMPLETED" ? sum + p.credits : sum;
    }, 0);

    res.json({ purchases, totalPurchased: total });
  } catch {
    res.status(500).json({ error: "Failed to load purchase history", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/credits/tiers ───────────────────────────────────────────────────
router.get("/tiers", (_req: Request, res: Response): void => {
  res.json({ tiers: PRICING_TIERS, customPricePerCredit: CUSTOM_PRICE_PER_CREDIT });
});

// ── GET /api/credits/usage ───────────────────────────────────────────────────
router.get("/usage", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.auth!.userId;
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setUTCDate(now.getUTCDate() - 6);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);

    // Get daily counts for AI Studio image enhancements
    const imageEnhancements = await prisma.aiStudioImage.findMany({
      where: {
        userId,
        createdAt: { gte: sevenDaysAgo },
      },
      select: { createdAt: true },
    });

    // Group by date
    const usageMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setUTCDate(sevenDaysAgo.getUTCDate() + i);
      const key = d.toISOString().split("T")[0];
      usageMap[key] = 0;
    }

    imageEnhancements.forEach((img) => {
      const key = img.createdAt.toISOString().split("T")[0];
      if (usageMap[key] !== undefined) {
        usageMap[key]++;
      }
    });

    // Convert to sorted array of { day: string, count: number }
    const usageData = Object.entries(usageMap).map(([date, count]) => {
      const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short" });
      return { day: dayName, count };
    });

    res.json(usageData);
  } catch (err) {
    console.error("Usage error:", err);
    res.status(500).json({ error: "Failed to load usage data", code: "INTERNAL_ERROR" });
  }
});

// ── POST /api/credits/checkout ───────────────────────────────────────────────
router.post("/checkout", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { credits } = req.body;

    if (!credits || typeof credits !== "number" || !Number.isInteger(credits) || credits < 10 || credits > 1000) {
      res.status(400).json({ error: "Credits must be an integer between 10 and 1000", code: "VALIDATION_ERROR" });
      return;
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      res.status(503).json({ error: "Payment service is not configured", code: "CONFIG_ERROR" });
      return;
    }

    const priceUsd = calculatePrice(credits);
    const amountInCents = Math.round(priceUsd * 100);
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const tierLabel = PRICING_TIERS.find((t) => t.credits === credits)?.label || "Custom";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `TijarFlow AI Credits — ${tierLabel} Pack`,
              description: `${credits} AI credits for image enhancement. Credits are added to your account instantly after payment.`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: req.auth!.userId,
        credits: credits.toString(),
        priceUsd: priceUsd.toString(),
      },
      success_url: `${clientUrl}/billing?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/billing?payment=cancelled`,
    });

    // Create a PENDING purchase record so we can track it
    await prisma.creditPurchase.create({
      data: {
        userId: req.auth!.userId,
        credits,
        amount: priceUsd,
        stripeSessionId: session.id,
        status: "PENDING",
      },
    });

    res.json({ url: session.url });
  } catch (err: unknown) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Failed to create checkout session", code: "INTERNAL_ERROR" });
  }
});

// ── POST /api/credits/webhook ────────────────────────────────────────────────
// Raw body required — must be registered BEFORE express.json() in index.ts
router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string;

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(503).json({ error: "Webhook secret not configured" });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    console.error("Webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = event.data.object as any;
    const { userId, credits } = session.metadata || {};

    if (!userId || !credits) {
      res.status(400).json({ error: "Missing metadata" });
      return;
    }

    const creditsNum = parseInt(credits, 10);

    try {
      await prisma.$transaction(async (tx) => {
        // Mark purchase as COMPLETED
        await tx.creditPurchase.update({
          where: { stripeSessionId: session.id },
          data: { status: "COMPLETED" },
        });

        // Add purchased credits to the user's purchasedCredits bank
        await tx.user.update({
          where: { id: userId },
          data: { purchasedCredits: { increment: creditsNum } },
        });
      });

      console.log(`✅ Credits granted: ${creditsNum} credits to user ${userId}`);
    } catch (err) {
      console.error("Failed to process webhook:", err);
      res.status(500).json({ error: "Failed to process payment" });
      return;
    }
  }

  res.json({ received: true });
});

// ── POST /api/credits/verify-session ─────────────────────────────────────────
// Called from the success page to confirm payment status for UI display
router.post("/verify-session", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== "string") {
      res.status(400).json({ error: "sessionId is required", code: "VALIDATION_ERROR" });
      return;
    }

    const purchase = await prisma.creditPurchase.findFirst({
      where: { stripeSessionId: sessionId, userId: req.auth!.userId },
      select: { credits: true, amount: true, status: true, createdAt: true },
    });

    if (!purchase) {
      res.status(404).json({ error: "Purchase not found", code: "NOT_FOUND" });
      return;
    }

    const balance = await getAICredits(prisma, req.auth!.userId);
    res.json({ purchase, balance });
  } catch {
    res.status(500).json({ error: "Failed to verify session", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/credits/usage ───────────────────────────────────────────────────
router.get("/usage", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.auth!.userId;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);

    const images = await prisma.aiStudioImage.findMany({
      where: { userId, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    });

    const result = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (6 - i));
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short" });
      const count = images.filter(img => img.createdAt.toISOString().slice(0, 10) === dateStr).length;
      return { day: dayLabel, count };
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to load usage", code: "INTERNAL_ERROR" });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function getNextMondayUTC(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const nextMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday));
  return nextMonday;
}

export default router;
