import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { runDailyDemoVideo } from "../services/dailyDemoVideo";
import { Niche, NICHES, todayKsaDate, nicheForDate } from "../lib/dailyDemo/niches";
import { signMediaPath, MEDIA_TTL_SHORT } from "../lib/mediaSign";

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

// ── POST /generate — fire a new generation ───────────────────────────────────
router.post("/generate", async (req: AuthRequest, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as { niche?: string; forDate?: string };

  let niche: Niche | undefined;
  if (body.niche) {
    if (!(body.niche in NICHES)) {
      res.status(400).json({ error: `Unknown niche: ${body.niche}`, code: "INVALID_NICHE" });
      return;
    }
    niche = body.niche as Niche;
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
  void runDailyDemoVideo(prisma, { forDate, niche, triggeredBy }).catch((err) => {
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
