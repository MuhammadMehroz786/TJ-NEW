import { Router, Response, RequestHandler } from "express";
import type { PrismaClient, Prisma } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { GenerateInputSchema, HistoryQuerySchema } from "../../../shared/contentAgent";
import { ContentAgentError, generateDraft } from "../services/contentAgent";
import type { ContentGeminiClient } from "../lib/contentAgent/geminiClient";

interface Deps {
  prisma: PrismaClient;
  gemini: ContentGeminiClient;
}

export function createContentAgentRouter({ prisma, gemini }: Deps): Router {
  const router = Router();
  router.use(authenticate);
  router.use(requireRole("ADMIN"));

  const generate: RequestHandler = async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = GenerateInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid input",
        code: "VALIDATION_ERROR",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }

    try {
      const draft = await generateDraft({
        prisma,
        gemini,
        userId: req.auth!.userId,
        input: parsed.data,
      });
      res.json(draft);
    } catch (err) {
      if (err instanceof ContentAgentError) {
        res.status(502).json({ error: err.message, code: err.code });
        return;
      }
      const message = err instanceof Error ? err.message : "unknown error";
      console.error("[content-agent] generate failed:", message);
      res.status(500).json({ error: "Generation failed", code: "INTERNAL_ERROR" });
    }
  };

  const history: RequestHandler = async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = HistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid query",
        code: "VALIDATION_ERROR",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    const { cursor, limit, language, platform, q, status } = parsed.data;

    const where: Prisma.ContentDraftWhereInput = { status };
    if (language) where.language = language;
    if (platform) where.platforms = { has: platform };
    if (q) where.topic = { contains: q, mode: "insensitive" };

    // Cursor pagination on (createdAt DESC, id DESC). Probe one extra row to
    // know whether there's another page; trim it off the response.
    const rows = await prisma.contentDraft.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
    res.json({ items, nextCursor });
  };

  const detail: RequestHandler = async (req: AuthRequest, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const row = await prisma.contentDraft.findUnique({
      where: { id },
      include: { versions: { orderBy: { createdAt: "desc" } } },
    });
    if (!row) {
      res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return;
    }
    res.json(row);
  };

  router.post("/generate", generate);
  router.get("/history", history);
  router.get("/history/:id", detail);
  return router;
}
