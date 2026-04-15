import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getSallaAuthUrl, exchangeSallaCode, SallaAuthError } from "../services/salla";
import { encrypt } from "../lib/crypto";

const router = Router();
const prisma = new PrismaClient();

// ── GET /api/salla/auth ───────────────────────────────────────────────────────
// Initiates the OAuth flow. Called from the client — redirects the browser to
// Salla's authorization page. The userId is encoded in `state` so the callback
// knows which user to connect the store to.
router.get("/auth", authenticate, (req: AuthRequest, res: Response): void => {
  const userId = req.auth!.userId;

  if (!process.env.SALLA_CLIENT_ID || !process.env.SALLA_REDIRECT_URI) {
    res.status(503).json({ error: "Salla integration is not configured", code: "CONFIG_ERROR" });
    return;
  }

  // Encode userId as base64 state — not secret, just routing info
  const state   = Buffer.from(userId).toString("base64url");
  const authUrl = getSallaAuthUrl(state);

  res.json({ url: authUrl });
});

// ── GET /api/salla/callback ───────────────────────────────────────────────────
// Salla redirects the user here after authorization.
// Query params: code, state (= base64url userId), and optionally error.
router.get("/callback", async (req: Request, res: Response): Promise<void> => {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const { code, state, error } = req.query as Record<string, string>;

  // User denied access
  if (error) {
    console.warn("Salla OAuth denied:", error);
    res.redirect(`${clientUrl}/marketplaces?salla=denied`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${clientUrl}/marketplaces?salla=error&reason=missing_params`);
    return;
  }

  // Decode userId from state
  let userId: string;
  try {
    userId = Buffer.from(state, "base64url").toString("utf8");
    if (!userId) throw new Error("empty");
  } catch {
    res.redirect(`${clientUrl}/marketplaces?salla=error&reason=invalid_state`);
    return;
  }

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.redirect(`${clientUrl}/marketplaces?salla=error&reason=user_not_found`);
    return;
  }

  // Exchange authorization code for tokens
  let tokens;
  try {
    tokens = await exchangeSallaCode(code);
  } catch (err) {
    console.error("Salla code exchange failed:", err);
    const reason = err instanceof SallaAuthError ? "auth_failed" : "token_error";
    res.redirect(`${clientUrl}/marketplaces?salla=error&reason=${reason}`);
    return;
  }

  // Fetch the store info to get storeName and storeUrl
  let storeName = "My Salla Store";
  let storeUrl  = "https://salla.sa";

  try {
    const storeRes = await fetch("https://api.salla.dev/admin/v2/store/info", {
      headers: {
        Authorization:  `Bearer ${tokens.access_token}`,
        Accept:         "application/json",
      },
    });
    if (storeRes.ok) {
      const storeBody = (await storeRes.json()) as {
        data?: { name?: string; domain?: string; url?: string };
      };
      storeName = storeBody.data?.name   ?? storeName;
      storeUrl  = storeBody.data?.domain ?? storeBody.data?.url ?? storeUrl;
    }
  } catch {
    // Store info fetch failed — use defaults, not a fatal error
  }

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  try {
    // Check if this store is already connected for this user
    const existing = await prisma.marketplaceConnection.findFirst({
      where: { userId, platform: "SALLA", storeUrl },
    });

    if (existing) {
      // Update tokens on the existing connection
      await prisma.$executeRawUnsafe(
        `UPDATE "MarketplaceConnection"
         SET "accessToken" = $1, "refreshToken" = $2, "tokenExpiresAt" = $3,
             "status" = 'CONNECTED', "updatedAt" = NOW()
         WHERE id = $4`,
        encrypt(tokens.access_token),
        encrypt(tokens.refresh_token),
        tokenExpiresAt,
        existing.id,
      );
    } else {
      // Create new connection using raw query (refreshToken column new)
      await prisma.$executeRawUnsafe(
        `INSERT INTO "MarketplaceConnection"
           (id, "userId", platform, "storeName", "storeUrl",
            "accessToken", "refreshToken", "tokenExpiresAt", status, "createdAt", "updatedAt")
         VALUES
           (gen_random_uuid(), $1, 'SALLA', $2, $3, $4, $5, $6, 'CONNECTED', NOW(), NOW())`,
        userId,
        storeName,
        storeUrl,
        encrypt(tokens.access_token),
        encrypt(tokens.refresh_token),
        tokenExpiresAt,
      );
    }

    res.redirect(`${clientUrl}/marketplaces?salla=connected`);
  } catch (err) {
    console.error("Failed to save Salla connection:", err);
    res.redirect(`${clientUrl}/marketplaces?salla=error&reason=db_error`);
  }
});

// ── GET /api/salla/status ─────────────────────────────────────────────────────
// Returns whether SALLA_CLIENT_ID / SALLA_CLIENT_SECRET are configured
// (used by the frontend to show/hide the OAuth connect button)
router.get("/status", (_req: Request, res: Response): void => {
  res.json({
    configured: !!(process.env.SALLA_CLIENT_ID && process.env.SALLA_CLIENT_SECRET),
  });
});

export default router;
