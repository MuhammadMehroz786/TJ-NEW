import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { runDailyDemoVideo } from "../services/dailyDemoVideo";
import { Niche, NICHES, todayKsaDate, nicheForDate } from "../lib/dailyDemo/niches";
import { signMediaPath, MEDIA_TTL_SHORT } from "../lib/mediaSign";
import {
  getChannelStatus,
  generateAuthUrl,
  handleOAuthCallback,
  clearTokens,
  loadConfig,
  saveConfig,
  uploadVideoToYoutube,
} from "../services/youtubeScheduler";

/**
 * Admin-only routes for the Daily Demo Video feature. All endpoints require
 * a logged-in ADMIN user.
 *
 * Routes:
 *   GET    /api/admin/daily-videos              — list, newest first
 *   GET    /api/admin/daily-videos/:id          — single video record + signed URLs
 *   POST   /api/admin/daily-videos/generate     — fire a new generation; returns the job row
 *   GET    /api/admin/daily-videos/niches       — niche catalog (for the manual-trigger picker)
 *
 * Generation is async — `POST /generate` kicks off the pipeline in the
 * background and returns the row immediately. The client polls `GET /:id`
 * until status === "done" (or "failed").
 */

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireRole("ADMIN"));

// ── YouTube Integration Routes ────────────────────────────────────────────────

router.get("/youtube/status", async (_req: AuthRequest, res: Response): Promise<void> => {
  const status = await getChannelStatus();
  res.json(status);
});

router.get("/youtube/auth-url", (req: AuthRequest, res: Response): void => {
  // We expect the frontend to send its origin, e.g. "https://app.tijarflow.com"
  const origin = typeof req.query.redirectOrigin === "string" ? req.query.redirectOrigin : "http://localhost:5173";
  const url = generateAuthUrl(origin);
  res.json({ url });
});

router.get("/youtube/oauth-callback", async (req: AuthRequest, res: Response): Promise<void> => {
  const code = req.query.code as string | undefined;
  const stateBase64 = req.query.state as string | undefined;
  const redirectOrigin = stateBase64 ? Buffer.from(stateBase64, "base64").toString("utf-8") : "http://localhost:5173";
  const redirectUrl = `${redirectOrigin}/admin?tab=daily-videos`;

  if (!code) {
    res.redirect(`${redirectUrl}&error=no_code`);
    return;
  }
  try {
    await handleOAuthCallback(code);
    res.redirect(`${redirectUrl}&connected=true`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[YouTube] Callback error:", msg);
    res.redirect(`${redirectUrl}&error=${encodeURIComponent(msg)}`);
  }
});

router.post("/youtube/disconnect", (_req: AuthRequest, res: Response): void => {
  clearTokens();
  res.json({ success: true });
});

router.get("/youtube/config", (_req: AuthRequest, res: Response): void => {
  const config = loadConfig();
  res.json(config);
});

router.post("/youtube/config", (req: AuthRequest, res: Response): void => {
  const current = loadConfig();
  const { autoPostEnabled, mode, intervalMinutes, postTimeKsa } = req.body;
  
  if (typeof autoPostEnabled === "boolean") current.autoPostEnabled = autoPostEnabled;
  if (mode === "interval" || mode === "time") current.mode = mode;
  if (typeof intervalMinutes === "number") current.intervalMinutes = intervalMinutes;
  if (typeof postTimeKsa === "string") current.postTimeKsa = postTimeKsa;

  // Clear nextPostTime if toggled on to force immediate recalculation by the scheduler loop
  if (current.autoPostEnabled) {
    current.nextPostTime = null;
  }
  saveConfig(current);
  res.json({ success: true, config: current });
});

// ── GET /niches ──────────────────────────────────────────────────────────────
router.get("/niches", (_req: AuthRequest, res: Response): void => {
  const list = (Object.keys(NICHES) as Niche[]).map((n) => ({
    niche: n,
    displayName: NICHES[n].displayName,
    displayNameAr: NICHES[n].displayNameAr,
  }));
  res.json({ niches: list });
});

// ── GET / — list videos, newest first, optional status filter ────────────────
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);

  const rows = await prisma.dailyDemoVideo.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Attach signed URLs for thumbnails so the dashboard can render previews
  // without needing a second round-trip per row.
  const data = rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    forDate: row.forDate,
    niche: row.niche,
    nicheDisplay: NICHES[row.niche as Niche]?.displayName ?? row.niche,
    status: row.status,
    errorMessage: row.errorMessage,
    triggeredBy: row.triggeredBy,
    costCents: row.costCents,
    renderMs: row.renderMs,
    youtubeStatus: row.youtubeStatus,
    youtubeId: row.youtubeId,
    youtubeErrorMessage: row.youtubeErrorMessage,
    thumbnailUrl: row.thumbnailPath ? signMediaPath(row.thumbnailPath, MEDIA_TTL_SHORT) : null,
    videoUrl: row.videoPath ? signMediaPath(row.videoPath, MEDIA_TTL_SHORT) : null,
  }));

  res.json({ videos: data });
});

// ── GET /:id — single video with full signed URLs ────────────────────────────
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const row = await prisma.dailyDemoVideo.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
    return;
  }

  res.json({
    video: {
      ...row,
      nicheDisplay: NICHES[row.niche as Niche]?.displayName ?? row.niche,
      thumbnailUrl: row.thumbnailPath ? signMediaPath(row.thumbnailPath, MEDIA_TTL_SHORT) : null,
      videoUrl: row.videoPath ? signMediaPath(row.videoPath, MEDIA_TTL_SHORT) : null,
      imageUrls: (row.imagePaths ?? []).map((p) => signMediaPath(p, MEDIA_TTL_SHORT)),
    },
  });
});

// ── PUT /:id — update metadata (title, description) ──────────────────────────
router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const { youtubeTitle, youtubeDescription } = req.body;
  const row = await prisma.dailyDemoVideo.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const script = (row.script as Record<string, unknown> | null) ?? {};
  if (typeof youtubeTitle === "string") script.youtubeTitle = youtubeTitle;
  if (typeof youtubeDescription === "string") script.youtubeDescription = youtubeDescription;

  const updated = await prisma.dailyDemoVideo.update({
    where: { id: row.id },
    data: { script: script as unknown as object },
  });
  res.json({ success: true, script: updated.script });
});

// ── POST /:id/post-now — trigger manual YouTube upload ───────────────────────
router.post("/:id/post-now", async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await uploadVideoToYoutube(prisma, req.params.id);
  if (result.success) {
    res.json({ success: true, youtubeId: result.youtubeId });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// ── POST /generate — fire a new generation ───────────────────────────────────
router.post("/generate", async (req: AuthRequest, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as { niche?: string; forDate?: string; productOverride?: string };

  let niche: Niche | undefined;
  if (body.niche) {
    if (!(body.niche in NICHES)) {
      res.status(400).json({ error: `Unknown niche: ${body.niche}`, code: "INVALID_NICHE" });
      return;
    }
    niche = body.niche as Niche;
  }

  // productOverride is required — admin must describe the specific product
  // they want featured (e.g. "21-karat gold bracelet with filigree work").
  // Caps at 200 chars to keep prompts focused and prevent runaway costs.
  const productOverride = typeof body.productOverride === "string" ? body.productOverride.trim() : "";
  if (!productOverride) {
    res.status(400).json({ error: "productOverride is required", code: "PRODUCT_REQUIRED" });
    return;
  }
  if (productOverride.length > 200) {
    res.status(400).json({ error: "productOverride too long (max 200 chars)", code: "PRODUCT_TOO_LONG" });
    return;
  }

  let forDate: Date | undefined;
  if (body.forDate) {
    const parsed = new Date(body.forDate);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: "Invalid forDate", code: "INVALID_DATE" });
      return;
    }
    // Normalize to UTC midnight to match the @db.Date column
    forDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  } else {
    forDate = todayKsaDate();
  }

  // Pre-create the row in "pending" status so the response can include an id
  // immediately for client-side polling. The actual pipeline runs in a
  // background task — we don't await it here.
  const triggeredBy = `manual:${req.auth!.userId}`;
  void runDailyDemoVideo(prisma, { forDate, niche, productOverride, triggeredBy }).catch((err) => {
    // The orchestrator catches its own errors and writes them to the row, so
    // this catch is just defense-in-depth for unexpected throws (e.g. DB down
    // before the first status update).
    console.error("[dailyDemo] background pipeline crashed:", err);
  });

  // Return the canonical row right away so the client can start polling.
  // The orchestrator created the row synchronously before kicking off the
  // async pipeline, so by the time we land here the row exists for
  // (forDate, resolvedNiche). The await above gives the orchestrator that
  // tick of event loop to do its initial create+update.
  const resolvedNiche = niche ?? nicheForDate(forDate);
  // Tiny sleep gives the orchestrator a chance to insert the row; without it
  // we sometimes race ahead and find no row to return.
  await new Promise((r) => setTimeout(r, 50));
  const row = await prisma.dailyDemoVideo.findUnique({
    where: { forDate_niche: { forDate, niche: resolvedNiche } },
  });

  res.json({ job: row ?? { status: "pending", niche: resolvedNiche, forDate } });
});

export default router;
