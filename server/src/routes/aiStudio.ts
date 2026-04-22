import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { AICreditError, consumeWeeklyAICredit, refundOneCredit } from "../services/aiCredits";
import { refineProductImage } from "../services/imageRefinement";
import { signMediaPath, MEDIA_TTL_SHORT } from "../lib/mediaSign";
import { enhanceWithGemini, backgroundScenes as enhanceBgScenes, EnhanceError } from "../lib/enhanceImage";
import { saveEnhancementToLibrary } from "../lib/imageStorage";
// Loaded untyped to sidestep the stale @types/express-serve-static-core tree
// that multer's types pull in. See products.ts for the same pattern.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require("adm-zip") as any;

// Sign the imageUrl on every record returned to the client. Stored DB value
// stays as a plain /media/... path; signatures are minted per-response.
function signRecord<T extends { imageUrl: string; imagePath: string }>(rec: T): T {
  return { ...rec, imageUrl: signMediaPath(rec.imagePath, MEDIA_TTL_SHORT) };
}
function signRecords<T extends { imageUrl: string; imagePath: string }>(recs: T[]): T[] {
  return recs.map(signRecord);
}

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);
router.use(requireRole("MERCHANT"));

const backgroundScenes: Record<string, string> = {
  studio:
    "a clean pure white infinity-curve studio background with professional three-point lighting (key light, fill light, and rim light), creating soft natural shadows beneath and behind the product",
  kitchen:
    "a modern luxury kitchen countertop made of white Carrara marble, with warm ambient lighting, a subtle depth-of-field blur on stainless steel appliances and a herb plant in the far background",
  mall:
    "a premium shopping mall display shelf with elegant recessed spotlights, polished glass shelving, and a softly blurred luxury retail environment behind",
  outdoor:
    "a beautiful outdoor tabletop setting during golden hour with warm directional sunlight, a lush green garden with creamy bokeh in the background, and a natural wooden surface",
  living_room:
    "a cozy modern Scandinavian living room side table, with soft diffused natural light streaming from large windows, a neutral-toned sofa and indoor plant softly blurred behind",
  office:
    "a sleek modern office desk with clean minimalist decor, a matte white surface, soft overhead LED panel lighting, and a subtly blurred monitor and bookshelf in the background",
  nature:
    "a rustic natural setting with a light-toned wooden surface, fresh green leaves and small potted plants arranged around, with soft dappled sunlight and a shallow depth-of-field background",
  gradient:
    "a smooth seamless gradient background transitioning from soft warm white to light grey, with subtle ambient lighting from above creating a gentle shadow beneath the product",
};

// Shot types — vary framing / composition / camera angle rather than background.
// Used by the Merchant Pack feature to generate a gallery of looks for the same
// product from ONE upload. Each shot re-uses the SAME product but with a
// different composition + scene hint.
const shotTypes: Record<string, { scene: string; composition: string }> = {
  hero: {
    scene: "a clean pure white studio background with professional three-point lighting",
    composition: "a centered hero product shot with the product filling roughly 70% of the frame, slight elevated camera angle, crisp sharp focus edge-to-edge",
  },
  macro: {
    scene: "a soft out-of-focus neutral studio background",
    composition: "an extreme close-up macro detail shot focusing on the product's texture, material, and finest details, with shallow depth of field emphasizing craftsmanship",
  },
  lifestyle_kitchen: {
    scene: "a bright modern kitchen counter with Carrara marble, natural window light, and softly blurred kitchenware in the background",
    composition: "a natural lifestyle angle showing the product in use context, slight 3/4 angle, warm ambient feeling",
  },
  lifestyle_outdoor: {
    scene: "an outdoor golden-hour setting with a natural wooden surface, warm directional sunlight, and a lush greenery bokeh background",
    composition: "a lifestyle context shot during golden hour, slight 3/4 angle, warm inviting atmosphere",
  },
  minimal: {
    scene: "a minimal seamless pastel-cream backdrop with soft directional light from the top-left",
    composition: "a clean editorial catalog shot with generous negative space around the product, centered",
  },
  flat_lay: {
    scene: "a flat-lay overhead composition on a light neutral surface (pale wood or matte cream) with soft even top-down lighting",
    composition: "a top-down flat-lay shot with the product centered, minimal shadows, editorial catalog style",
  },
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB decoded

function detectImageMime(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // WebP: "RIFF" .... "WEBP"
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}

class ImageValidationError extends Error {
  status = 400;
  code = "INVALID_IMAGE";
}

function parseBase64Image(input: string): { mimeType: string; base64: string; ext: string } {
  const match = input.match(/^data:([^;]+);base64,(.+)$/);
  const declaredMime = match ? match[1] : "image/png";
  const base64 = match ? match[2] : input.split(",")[1] || input;

  // Validate by magic bytes — never trust the data-URI prefix. This blocks
  // attempts to smuggle SVG, HTML, or non-image files by labelling them image/png.
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    throw new ImageValidationError("Image data is not valid base64");
  }
  if (buf.length === 0) throw new ImageValidationError("Image is empty");
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new ImageValidationError(`Image too large (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB)`);
  }
  const actualMime = detectImageMime(buf);
  if (!actualMime) {
    throw new ImageValidationError("Unsupported image format — use JPEG, PNG, or WebP");
  }
  // If declared mime disagrees with the bytes, trust the bytes.
  const mimeType = actualMime;
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  return { mimeType, base64, ext: extMap[mimeType] || "png" };
}

async function saveBase64ToStorage(base64: string, relativePath: string): Promise<void> {
  const storageRoot = path.resolve(process.cwd(), "storage");
  const fullPath = path.join(storageRoot, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(base64, "base64"));
}

// GET /api/ai-studio/folders
router.get("/folders", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await prisma.aiStudioFolder.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { images: true } } },
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to load folders", code: "INTERNAL_ERROR" });
  }
});

// POST /api/ai-studio/folders
router.post("/folders", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Folder name is required", code: "VALIDATION_ERROR" });
      return;
    }
    const folder = await prisma.aiStudioFolder.create({
      data: { userId: req.auth!.userId, name: name.slice(0, 80) },
    });
    res.status(201).json(folder);
  } catch (err: any) {
    if (String(err?.code) === "P2002") {
      res.status(400).json({ error: "Folder with this name already exists", code: "DUPLICATE_FOLDER" });
      return;
    }
    res.status(500).json({ error: "Failed to create folder", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/ai-studio/folders/:id
router.patch("/folders/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Folder name is required", code: "VALIDATION_ERROR" });
      return;
    }

    const existing = await prisma.aiStudioFolder.findFirst({
      where: { id, userId: req.auth!.userId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Folder not found", code: "NOT_FOUND" });
      return;
    }

    const updated = await prisma.aiStudioFolder.update({
      where: { id },
      data: { name: name.slice(0, 80) },
      include: { _count: { select: { images: true } } },
    });
    res.json(updated);
  } catch (err: any) {
    if (String(err?.code) === "P2002") {
      res.status(400).json({ error: "Folder with this name already exists", code: "DUPLICATE_FOLDER" });
      return;
    }
    res.status(500).json({ error: "Failed to rename folder", code: "INTERNAL_ERROR" });
  }
});

// DELETE /api/ai-studio/folders/:id
router.delete("/folders/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.aiStudioFolder.findFirst({
      where: { id, userId: req.auth!.userId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Folder not found", code: "NOT_FOUND" });
      return;
    }

    await prisma.aiStudioImage.updateMany({
      where: { userId: req.auth!.userId, folderId: id },
      data: { folderId: null },
    });
    await prisma.aiStudioFolder.delete({ where: { id } });
    res.json({ message: "Folder deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete folder", code: "INTERNAL_ERROR" });
  }
});

// GET /api/ai-studio/images
router.get("/images", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 24));

    const where = { userId: req.auth!.userId };
    const [data, total] = await Promise.all([
      prisma.aiStudioImage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          folder: { select: { id: true, name: true } },
        },
      }),
      prisma.aiStudioImage.count({ where }),
    ]);

    res.json({ data: signRecords(data), total, page, pageSize });
  } catch {
    res.status(500).json({ error: "Failed to load AI Studio images", code: "INTERNAL_ERROR" });
  }
});

// POST /api/ai-studio/enhance
router.post("/enhance", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { image, background, folderId } = req.body as { image?: string; background?: string; folderId?: string | null };

    if (!image) {
      res.status(400).json({ error: "Please upload an image first", code: "VALIDATION_ERROR" });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: "GEMINI_API_KEY is not set", code: "CONFIG_ERROR" });
      return;
    }

    // Validate image BEFORE consuming credit — reject SVG/HTML/oversize early
    let parsedInput: { mimeType: string; base64: string; ext: string };
    try {
      parsedInput = parseBase64Image(image);
    } catch (err) {
      if (err instanceof ImageValidationError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }

    const creditUsage = await consumeWeeklyAICredit(prisma, req.auth!.userId);

    try {
      const sceneName = background && backgroundScenes[background] ? background : "studio";
      const sceneDescription = backgroundScenes[sceneName];
      const fixedPrompt = `You are a professional e-commerce product photographer. Edit this product image following these strict rules:

PRODUCT PRESERVATION (most important):
- Keep the product EXACTLY as it is — same shape, size, proportions, colors, textures, labels, and details.
- Do NOT alter, regenerate, distort, or artistically reinterpret the product in any way.
- Maintain the product's original scale and perspective angle.

BACKGROUND REPLACEMENT:
- Completely remove the existing background.
- Replace it with: ${sceneDescription}.
- The new background must look photorealistic and naturally match the product's perspective and viewing angle.

LIGHTING & SHADOWS:
- Adjust the product's lighting to seamlessly match the new background environment.
- Add realistic, soft contact shadows beneath the product that match the light direction of the scene.
- Ensure consistent color temperature between the product and background.
- Add subtle reflections on glossy surfaces if the background surface would naturally produce them.

IMAGE QUALITY:
- Output a sharp, high-resolution, professional e-commerce photograph.
- Enhance clarity and detail on the product without changing its appearance.
- Use proper white balance and color grading appropriate for the scene.

STRICT RULES:
- Do NOT add any text, watermarks, logos, or branding.
- Do NOT add extra objects, props, or decorations that weren't specified in the background.
- Do NOT crop or change the framing — keep the product centered and properly composed.
- The result must look like an authentic photograph, not a composite or collage.`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ inlineData: { mimeType: parsedInput.mimeType, data: parsedInput.base64 } }, fixedPrompt],
        config: { responseModalities: ["image", "text"] },
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (!parts) throw new Error("No response parts returned.");

      const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
      if (!imagePart?.inlineData?.data) throw new Error("No image data in response.");

      const rawOutputMime = imagePart.inlineData.mimeType || "image/png";
      const extMap: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      };
      // Only accept the 3 image mime types we support; ignore anything else Gemini might return
      const outputMimeType = extMap[rawOutputMime] ? rawOutputMime : "image/png";
      const outputExt = extMap[outputMimeType] || "png";
      const outputBase64 = imagePart.inlineData.data as string;

      const randomId = crypto.randomUUID();
      const relativePath = path.join("ai-studio", req.auth!.userId, `${Date.now()}-${randomId}.${outputExt}`);
      const normalizedPath = relativePath.replaceAll("\\", "/");
      await saveBase64ToStorage(outputBase64, normalizedPath);

      const imageUrl = `/media/${normalizedPath}`;
      let selectedFolderId: string | null = null;
      if (folderId) {
        const folder = await prisma.aiStudioFolder.findFirst({
          where: { id: folderId, userId: req.auth!.userId },
          select: { id: true },
        });
        if (folder) selectedFolderId = folder.id;
      }

      const record = await prisma.aiStudioImage.create({
        data: {
          userId: req.auth!.userId,
          folderId: selectedFolderId,
          imagePath: normalizedPath,
          imageUrl,
          background: sceneName,
        },
        include: {
          folder: { select: { id: true, name: true } },
        },
      });

      res.status(201).json({
        ...signRecord(record),
        remainingCredits: creditUsage.totalCredits,
        weeklyCredits: creditUsage.weeklyCredits,
        purchasedCredits: creditUsage.purchasedCredits,
        creditsResetWeek: creditUsage.resetWeek,
      });
    } catch (innerErr: unknown) {
      // Refund the credit that was consumed before the Gemini call failed
      await refundOneCredit(prisma, req.auth!.userId, creditUsage.usedPool);
      throw innerErr;
    }
  } catch (err: any) {
    if (err instanceof AICreditError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error("AI Studio enhance error:", err);
    const message = err?.message || "";
    // Gemini rejections are typically 400-class on their end; surface a useful message
    if (/Unable to process input image|INVALID_ARGUMENT|input image/i.test(message)) {
      res.status(400).json({
        error: "We couldn't process that image. Try a different file (JPEG or PNG, at least 200×200 px).",
        code: "INVALID_IMAGE",
      });
      return;
    }
    res.status(500).json({ error: "Failed to enhance image", code: "ENHANCE_ERROR" });
  }
});

// ── Merchant Pack — one upload, many shots ────────────────────────────────────
// Given a single image, generate N variants in parallel: different compositions,
// backgrounds, framings. Each shot = one Gemini call = one credit. Failures are
// refunded individually; successes are persisted individually.
//
// Body: { image: base64 data URI, scenes: string[] (background or shot names), folderId? }
// Response: { results: AiStudioImage[], failures: { scene, error }[], remainingCredits, ... }

function buildShotPrompt(sceneName: string): string {
  const shotType = shotTypes[sceneName];
  const bg = backgroundScenes[sceneName];
  const sceneDescription = shotType?.scene || bg || backgroundScenes.studio;
  const composition = shotType?.composition || "keep the product centered and properly composed with professional e-commerce framing";

  return `You are a professional e-commerce product photographer. Edit this product image following these strict rules:

PRODUCT PRESERVATION (most important):
- Keep the product EXACTLY as it is — same shape, size, proportions, colors, textures, labels, and details.
- Do NOT alter, regenerate, distort, or artistically reinterpret the product in any way.

SCENE & BACKGROUND:
- Completely remove the existing background.
- Replace it with: ${sceneDescription}.
- The new background must look photorealistic.

COMPOSITION:
- ${composition}

LIGHTING & SHADOWS:
- Adjust the product's lighting to match the new environment.
- Add realistic soft contact shadows beneath the product matching the light direction.
- Ensure consistent color temperature between product and background.

IMAGE QUALITY:
- Output a sharp, high-resolution, professional e-commerce photograph.

STRICT RULES:
- Do NOT add text, watermarks, logos, or branding.
- Do NOT add extra objects or props beyond what the scene describes.
- The result must look like an authentic photograph, not a composite.`;
}

// Preset "packs" — lists of shot names for one-click multi-generation
const presetPacks: Record<string, string[]> = {
  starter:  ["hero", "lifestyle_kitchen", "macro"],
  full:     ["hero", "lifestyle_kitchen", "lifestyle_outdoor", "macro", "flat_lay"],
  catalog:  ["studio", "minimal", "gradient"],
  lifestyle: ["lifestyle_kitchen", "lifestyle_outdoor", "hero"],
};

const MAX_PACK_SIZE = 6; // cap concurrent Gemini calls per request

router.post("/enhance-pack", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { image, scenes, preset, folderId } = req.body as {
      image?: string;
      scenes?: string[];
      preset?: string;
      folderId?: string | null;
    };

    if (!image) {
      res.status(400).json({ error: "Please upload an image first", code: "VALIDATION_ERROR" });
      return;
    }

    // Resolve scenes — accept either explicit list or preset name
    let sceneList: string[] = Array.isArray(scenes) ? scenes.filter((s) => typeof s === "string") : [];
    if (preset && typeof preset === "string" && presetPacks[preset]) {
      sceneList = presetPacks[preset];
    }
    sceneList = sceneList.slice(0, MAX_PACK_SIZE);
    if (sceneList.length === 0) {
      res.status(400).json({ error: "scenes[] or a valid preset is required", code: "VALIDATION_ERROR" });
      return;
    }

    // Validate each requested scene is real
    const validScenes = sceneList.filter((s) => shotTypes[s] || backgroundScenes[s]);
    if (validScenes.length === 0) {
      res.status(400).json({ error: "No valid scenes provided", code: "VALIDATION_ERROR" });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: "GEMINI_API_KEY is not set", code: "CONFIG_ERROR" });
      return;
    }

    // Validate image bytes before consuming any credits
    let parsedInput: { mimeType: string; base64: string; ext: string };
    try {
      parsedInput = parseBase64Image(image);
    } catch (err) {
      if (err instanceof ImageValidationError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }

    // Resolve target folder once
    let selectedFolderId: string | null = null;
    if (folderId) {
      const folder = await prisma.aiStudioFolder.findFirst({
        where: { id: folderId, userId: req.auth!.userId },
        select: { id: true },
      });
      if (folder) selectedFolderId = folder.id;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Try to consume enough credits for all requested scenes up front. If the
    // user has fewer credits than scenes, only generate what they can afford.
    // Each successful consume records its pool so we can refund the right one.
    type Consumed = { usedPool: "weekly" | "purchased" };
    const consumes: Consumed[] = [];
    try {
      for (let i = 0; i < validScenes.length; i++) {
        const usage = await consumeWeeklyAICredit(prisma, req.auth!.userId);
        consumes.push({ usedPool: usage.usedPool });
      }
    } catch (err) {
      if (err instanceof AICreditError) {
        // ran out mid-reserve; we keep what we already consumed and generate only those
        // (sceneList truncated below)
      } else {
        throw err;
      }
    }
    const affordable = consumes.length;
    const scenesToGenerate = validScenes.slice(0, affordable);
    const skipped = validScenes.slice(affordable).map((s) => ({ scene: s, reason: "insufficient_credits" as const }));
    if (scenesToGenerate.length === 0) {
      res.status(402).json({
        error: "You don't have enough credits for any shots in this pack.",
        code: "INSUFFICIENT_CREDITS",
      });
      return;
    }

    // Run all Gemini calls in parallel. Each item's outcome is independent.
    const results = await Promise.all(
      scenesToGenerate.map(async (sceneName, idx) => {
        try {
          const prompt = buildShotPrompt(sceneName);
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: [{ inlineData: { mimeType: parsedInput.mimeType, data: parsedInput.base64 } }, prompt],
            config: { responseModalities: ["image", "text"] },
          });
          const parts = response.candidates?.[0]?.content?.parts;
          if (!parts) throw new Error("No response parts returned.");
          const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
          if (!imagePart?.inlineData?.data) throw new Error("No image data in response.");

          const rawMime = imagePart.inlineData.mimeType || "image/png";
          const extMap: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
          const outputMime = extMap[rawMime] ? rawMime : "image/png";
          const outputExt = extMap[outputMime] || "png";
          const outputBase64 = imagePart.inlineData.data as string;

          const randomId = crypto.randomUUID();
          const relativePath = path.join("ai-studio", req.auth!.userId, `${Date.now()}-${idx}-${randomId}.${outputExt}`);
          const normalizedPath = relativePath.replaceAll("\\", "/");
          await saveBase64ToStorage(outputBase64, normalizedPath);

          const record = await prisma.aiStudioImage.create({
            data: {
              userId: req.auth!.userId,
              folderId: selectedFolderId,
              imagePath: normalizedPath,
              imageUrl: `/media/${normalizedPath}`,
              background: sceneName,
            },
            include: { folder: { select: { id: true, name: true } } },
          });

          return { ok: true as const, scene: sceneName, record };
        } catch (e) {
          return { ok: false as const, scene: sceneName, error: (e as Error).message || "generation failed" };
        }
      }),
    );

    // Refund failed shots (consumes was 1:1 with scenesToGenerate, in order)
    const failures: { scene: string; error: string }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.ok) {
        failures.push({ scene: r.scene, error: r.error });
        try { await refundOneCredit(prisma, req.auth!.userId, consumes[i].usedPool); } catch { /* best-effort */ }
      }
    }

    const successful = results.filter((r): r is { ok: true; scene: string; record: any } => r.ok).map((r) => signRecord(r.record));

    // Final balance for the response so the client can update its credit display
    const freshUser = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { aiCredits: true, purchasedCredits: true },
    });

    res.status(successful.length > 0 ? 201 : 500).json({
      results: successful,
      failures: [...failures, ...skipped.map((s) => ({ scene: s.scene, error: "Not enough credits" }))],
      scenesRequested: validScenes.length,
      scenesGenerated: successful.length,
      weeklyCredits: freshUser?.aiCredits ?? null,
      purchasedCredits: freshUser?.purchasedCredits ?? null,
      remainingCredits: (freshUser?.aiCredits ?? 0) + (freshUser?.purchasedCredits ?? 0),
    });
  } catch (err: any) {
    if (err instanceof AICreditError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error("AI Studio pack error:", err);
    res.status(500).json({ error: "Failed to generate pack", code: "ENHANCE_PACK_ERROR" });
  }
});

// GET /api/ai-studio/presets — list available packs + shot types
router.get("/presets", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({
      presets: Object.entries(presetPacks).map(([id, scenes]) => ({ id, scenes, count: scenes.length })),
      shotTypes: Object.keys(shotTypes),
      backgrounds: Object.keys(backgroundScenes),
    });
  } catch {
    res.status(500).json({ error: "Failed to load presets", code: "INTERNAL_ERROR" });
  }
});

// POST /api/ai-studio/refine
router.post("/refine", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { imageId, instruction, folderId } = req.body as {
      imageId?: string;
      instruction?: string;
      folderId?: string | null;
    };

    if (!imageId || typeof imageId !== "string") {
      res.status(400).json({ error: "imageId is required", code: "VALIDATION_ERROR" });
      return;
    }
    const trimmedInstruction = String(instruction || "").trim();
    if (trimmedInstruction.length < 3) {
      res.status(400).json({ error: "Please describe the refinement (at least 3 characters)", code: "VALIDATION_ERROR" });
      return;
    }
    if (trimmedInstruction.length > 500) {
      res.status(400).json({ error: "Refinement instruction is too long (max 500 characters)", code: "VALIDATION_ERROR" });
      return;
    }
    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: "GEMINI_API_KEY is not set", code: "CONFIG_ERROR" });
      return;
    }

    const sourceImage = await prisma.aiStudioImage.findFirst({
      where: { id: imageId, userId: req.auth!.userId },
      select: { id: true, imagePath: true, background: true, folderId: true },
    });
    if (!sourceImage) {
      res.status(404).json({ error: "Image not found", code: "NOT_FOUND" });
      return;
    }

    const storageRoot = path.resolve(process.cwd(), "storage");
    const sourceFullPath = path.join(storageRoot, sourceImage.imagePath);
    let sourceBuffer: Buffer;
    try {
      sourceBuffer = await fs.readFile(sourceFullPath);
    } catch {
      res.status(404).json({ error: "Source image file not found", code: "NOT_FOUND" });
      return;
    }

    const sourceMimeType =
      sourceImage.imagePath.endsWith(".png") ? "image/png" :
      sourceImage.imagePath.endsWith(".webp") ? "image/webp" :
      "image/jpeg";

    const creditUsage = await consumeWeeklyAICredit(prisma, req.auth!.userId);

    try {
      const refined = await refineProductImage(
        sourceBuffer.toString("base64"),
        sourceMimeType,
        trimmedInstruction,
      );

      const outputMimeType = refined.mimeType;
      const extMap: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      };
      const outputExt = extMap[outputMimeType] || "png";

      const randomId = crypto.randomUUID();
      const relativePath = path.join("ai-studio", req.auth!.userId, `${Date.now()}-${randomId}.${outputExt}`);
      const normalizedPath = relativePath.replaceAll("\\", "/");
      await saveBase64ToStorage(refined.base64, normalizedPath);

      const imageUrl = `/media/${normalizedPath}`;

      // Target folder: explicit folderId override > source image folder > null
      let targetFolderId: string | null = null;
      if (folderId === null) {
        targetFolderId = null;
      } else if (typeof folderId === "string" && folderId) {
        const folder = await prisma.aiStudioFolder.findFirst({
          where: { id: folderId, userId: req.auth!.userId },
          select: { id: true },
        });
        if (folder) targetFolderId = folder.id;
      } else {
        targetFolderId = sourceImage.folderId;
      }

      const record = await prisma.aiStudioImage.create({
        data: {
          userId: req.auth!.userId,
          folderId: targetFolderId,
          imagePath: normalizedPath,
          imageUrl,
          background: sourceImage.background,
        },
        include: {
          folder: { select: { id: true, name: true } },
        },
      });

      res.status(201).json({
        ...signRecord(record),
        remainingCredits: creditUsage.totalCredits,
        weeklyCredits: creditUsage.weeklyCredits,
        purchasedCredits: creditUsage.purchasedCredits,
        creditsResetWeek: creditUsage.resetWeek,
      });
    } catch (innerErr: unknown) {
      await refundOneCredit(prisma, req.auth!.userId, creditUsage.usedPool);
      throw innerErr;
    }
  } catch (err: unknown) {
    if (err instanceof AICreditError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error("AI Studio refine error:", err);
    const message = (err as Error)?.message || "";
    if (/Unable to process input image|INVALID_ARGUMENT|input image/i.test(message)) {
      res.status(400).json({
        error: "We couldn't refine that image — try a different instruction or a new image.",
        code: "INVALID_IMAGE",
      });
      return;
    }
    res.status(500).json({ error: "Failed to refine image", code: "REFINE_ERROR" });
  }
});

// PATCH /api/ai-studio/images/:id/folder
router.patch("/images/:id/folder", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const imageId = req.params.id as string;
    const folderId = req.body?.folderId as string | null | undefined;

    const existing = await prisma.aiStudioImage.findFirst({
      where: { id: imageId, userId: req.auth!.userId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Image not found", code: "NOT_FOUND" });
      return;
    }

    let targetFolderId: string | null = null;
    if (folderId) {
      const folder = await prisma.aiStudioFolder.findFirst({
        where: { id: folderId, userId: req.auth!.userId },
        select: { id: true },
      });
      if (!folder) {
        res.status(404).json({ error: "Folder not found", code: "NOT_FOUND" });
        return;
      }
      targetFolderId = folder.id;
    }

    const updated = await prisma.aiStudioImage.update({
      where: { id: imageId },
      data: { folderId: targetFolderId },
      include: { folder: { select: { id: true, name: true } } },
    });
    res.json(signRecord(updated));
  } catch {
    res.status(500).json({ error: "Failed to move image", code: "INTERNAL_ERROR" });
  }
});

// GET /api/ai-studio/library (for Product image picker)
router.get("/library", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const folderId = (req.query.folderId as string) || "all";
    const where = folderId === "all"
      ? { userId: req.auth!.userId }
      : { userId: req.auth!.userId, folderId };
    const data = await prisma.aiStudioImage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { folder: { select: { id: true, name: true } } },
    });
    res.json({ data: signRecords(data) });
  } catch {
    res.status(500).json({ error: "Failed to load library", code: "INTERNAL_ERROR" });
  }
});

// DELETE /api/ai-studio/images/:id
router.delete("/images/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.aiStudioImage.findFirst({
      where: { id: req.params.id as string, userId: req.auth!.userId },
    });

    if (!existing) {
      res.status(404).json({ error: "Image not found", code: "NOT_FOUND" });
      return;
    }

    const storageRoot = path.resolve(process.cwd(), "storage");
    const fullPath = path.join(storageRoot, existing.imagePath);
    await fs.unlink(fullPath).catch(() => {});

    await prisma.aiStudioImage.delete({ where: { id: existing.id } });
    res.json({ message: "Image deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete image", code: "INTERNAL_ERROR" });
  }
});

// ── Bulk image operations ─────────────────────────────────────────────────────
// One endpoint for destructive/labelling bulk actions over selected gallery
// images. Kept tight — the merchant-facing flow has move, delete, and a
// bulk relabel of the "background" scene text that shows under each tile.
//
// Body: { ids: string[], action: "move" | "delete" | "relabel",
//         folderId?: string | null,   // required when action=move
//         background?: string }        // required when action=relabel
const BULK_MAX_IDS = 200;

router.patch("/images/bulk", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = req.body as { ids?: unknown; action?: unknown; folderId?: unknown; background?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "ids array is required", code: "VALIDATION_ERROR" });
      return;
    }
    if (ids.length > BULK_MAX_IDS) {
      res.status(400).json({ error: `Too many items (max ${BULK_MAX_IDS})`, code: "TOO_MANY" });
      return;
    }

    const action = body.action;
    const where = { id: { in: ids }, userId: req.auth!.userId };

    if (action === "move") {
      let folderId: string | null = null;
      if (body.folderId !== null && body.folderId !== undefined && body.folderId !== "") {
        if (typeof body.folderId !== "string") {
          res.status(400).json({ error: "folderId must be a string or null", code: "VALIDATION_ERROR" });
          return;
        }
        // Confirm the target folder belongs to this user before moving
        const folder = await prisma.aiStudioFolder.findFirst({
          where: { id: body.folderId, userId: req.auth!.userId },
          select: { id: true },
        });
        if (!folder) {
          res.status(404).json({ error: "Target folder not found", code: "NOT_FOUND" });
          return;
        }
        folderId = folder.id;
      }
      const result = await prisma.aiStudioImage.updateMany({ where, data: { folderId } });
      res.json({ moved: result.count });
      return;
    }

    if (action === "relabel") {
      const background = typeof body.background === "string" ? body.background.trim().slice(0, 80) : "";
      if (!background) {
        res.status(400).json({ error: "background is required for relabel", code: "VALIDATION_ERROR" });
        return;
      }
      const result = await prisma.aiStudioImage.updateMany({ where, data: { background } });
      res.json({ relabelled: result.count });
      return;
    }

    if (action === "delete") {
      // Find files to unlink before the DB delete so we don't orphan storage
      const rows = await prisma.aiStudioImage.findMany({
        where,
        select: { imagePath: true },
      });
      const storageRoot = path.resolve(process.cwd(), "storage");
      await Promise.all(rows.map((r) =>
        fs.unlink(path.join(storageRoot, r.imagePath)).catch(() => {}),
      ));
      const result = await prisma.aiStudioImage.deleteMany({ where });
      res.json({ deleted: result.count });
      return;
    }

    res.status(400).json({ error: "action must be one of move, delete, relabel", code: "VALIDATION_ERROR" });
  } catch (err) {
    console.error("Bulk image op error:", err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/ai-studio/images/download-zip — stream selected images as a ZIP.
// adm-zip builds in memory; fine for the realistic merchant case (~50 shots),
// would want to switch to `archiver` streaming if batch sizes grow past a
// few hundred MB.
// Body: { ids: string[] }
router.post("/images/download-zip", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "ids array is required", code: "VALIDATION_ERROR" });
      return;
    }
    if (ids.length > BULK_MAX_IDS) {
      res.status(400).json({ error: `Too many items (max ${BULK_MAX_IDS})`, code: "TOO_MANY" });
      return;
    }

    const rows = await prisma.aiStudioImage.findMany({
      where: { id: { in: ids }, userId: req.auth!.userId },
      select: { id: true, imagePath: true, background: true, createdAt: true },
    });
    if (rows.length === 0) {
      res.status(404).json({ error: "No images found", code: "NOT_FOUND" });
      return;
    }

    const storageRoot = path.resolve(process.cwd(), "storage");
    const zip = new AdmZip();
    let added = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const abs = path.join(storageRoot, r.imagePath);
      try {
        const buf = await fs.readFile(abs);
        const ext = path.extname(r.imagePath) || ".png";
        // Human-readable name, deduplicated with an index so the same
        // "kitchen" scene doesn't overwrite earlier ones in the zip.
        const safeLabel = (r.background || "image").replace(/[^a-z0-9-_]/gi, "-").slice(0, 40);
        const fname = `${String(i + 1).padStart(3, "0")}-${safeLabel}${ext}`;
        zip.addFile(fname, buf);
        added++;
      } catch {
        // Missing file on disk — skip silently, continue the rest
      }
    }
    if (added === 0) {
      res.status(404).json({ error: "None of the selected images could be read", code: "NOT_FOUND" });
      return;
    }

    const outBuffer = zip.toBuffer() as Buffer;
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="tijarflow-ai-studio-${stamp}.zip"`);
    res.setHeader("Content-Length", String(outBuffer.length));
    res.send(outBuffer);
  } catch (err) {
    console.error("Download zip error:", err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/ai-studio/images/bulk-enhance — run a fresh enhancement over N
// library images at once. Each image becomes input for a new Gemini call
// using the chosen scene (or custom theme text). Output is saved as a NEW
// AiStudioImage so the originals stay intact.
//
// Body: { ids: string[], scene?: string, sceneText?: string, folderId?: string|null }
const LIB_BULK_ENHANCE_CONCURRENCY = 3;
const LIB_BULK_ENHANCE_MAX = 50;

router.post("/images/bulk-enhance", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = req.body as { ids?: unknown; scene?: unknown; sceneText?: unknown; folderId?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "ids array is required", code: "VALIDATION_ERROR" });
      return;
    }
    if (ids.length > LIB_BULK_ENHANCE_MAX) {
      res.status(400).json({ error: `Max ${LIB_BULK_ENHANCE_MAX} images per batch`, code: "TOO_MANY" });
      return;
    }
    const sceneInput = typeof body.scene === "string" ? body.scene : "studio";
    const scene = enhanceBgScenes[sceneInput] ? sceneInput : "studio";
    const sceneText = typeof body.sceneText === "string" && body.sceneText.trim() ? body.sceneText.trim() : undefined;

    let targetFolderName: string | undefined = undefined;
    let targetFolderId: string | null = null;
    if (body.folderId !== null && body.folderId !== undefined && body.folderId !== "") {
      if (typeof body.folderId !== "string") {
        res.status(400).json({ error: "folderId must be a string or null", code: "VALIDATION_ERROR" });
        return;
      }
      const folder = await prisma.aiStudioFolder.findFirst({
        where: { id: body.folderId, userId: req.auth!.userId },
        select: { id: true, name: true },
      });
      if (!folder) {
        res.status(404).json({ error: "Target folder not found", code: "NOT_FOUND" });
        return;
      }
      targetFolderId = folder.id;
      targetFolderName = folder.name;
    }

    const rows = await prisma.aiStudioImage.findMany({
      where: { id: { in: ids }, userId: req.auth!.userId },
      select: { id: true, imagePath: true },
    });
    const foundMap = new Map(rows.map((r) => [r.id, r]));

    const succeeded: { sourceId: string; newId: string; enhancedImageUrl: string }[] = [];
    const failed: { sourceId: string; error: string }[] = [];
    let lastRemaining: number | null = null;

    const enhanceOne = async (sourceId: string): Promise<void> => {
      const src = foundMap.get(sourceId);
      if (!src) { failed.push({ sourceId, error: "Image not found" }); return; }

      const storageRoot = path.resolve(process.cwd(), "storage");
      let inputBuf: Buffer;
      try {
        inputBuf = await fs.readFile(path.join(storageRoot, src.imagePath));
      } catch {
        failed.push({ sourceId, error: "Source file missing on disk" });
        return;
      }

      // Detect mime from magic bytes, same as enhanceImage.detectImageMime
      let mimeType: "image/png" | "image/jpeg" | "image/webp" | null = null;
      if (inputBuf.length >= 12) {
        if (inputBuf[0] === 0x89 && inputBuf[1] === 0x50 && inputBuf[2] === 0x4e && inputBuf[3] === 0x47) mimeType = "image/png";
        else if (inputBuf[0] === 0xff && inputBuf[1] === 0xd8 && inputBuf[2] === 0xff) mimeType = "image/jpeg";
        else if (
          inputBuf[0] === 0x52 && inputBuf[1] === 0x49 && inputBuf[2] === 0x46 && inputBuf[3] === 0x46 &&
          inputBuf[8] === 0x57 && inputBuf[9] === 0x45 && inputBuf[10] === 0x42 && inputBuf[11] === 0x50
        ) mimeType = "image/webp";
      }
      if (!mimeType) {
        failed.push({ sourceId, error: "Unsupported image format" });
        return;
      }

      let creditUsage;
      try {
        creditUsage = await consumeWeeklyAICredit(prisma, req.auth!.userId);
      } catch (err) {
        failed.push({ sourceId, error: err instanceof AICreditError ? err.message : "Credit check failed" });
        throw err;
      }

      try {
        const output = await enhanceWithGemini({
          inputMime: mimeType,
          inputBase64: inputBuf.toString("base64"),
          scene,
          sceneText,
        });
        const saved = await saveEnhancementToLibrary(prisma, {
          userId: req.auth!.userId,
          base64: output.base64,
          mimeType: output.mimeType,
          background: sceneText ? `custom: ${sceneText.slice(0, 60)}` : scene,
          folderName: targetFolderName, // undefined → unfiled; folder existence already verified above
        });
        // If the caller chose a specific folder id, the helper auto-created-or-
        // reused by name — but the NAME lookup may drift if the merchant renamed
        // their folder. Force-set the folderId to be safe.
        if (targetFolderId && saved.id) {
          await prisma.aiStudioImage.update({ where: { id: saved.id }, data: { folderId: targetFolderId } });
        }
        succeeded.push({
          sourceId,
          newId: saved.id,
          enhancedImageUrl: signMediaPath(saved.imagePath, MEDIA_TTL_SHORT),
        });
        lastRemaining = creditUsage.totalCredits;
      } catch (innerErr: any) {
        await refundOneCredit(prisma, req.auth!.userId, creditUsage.usedPool);
        const msg = innerErr?.message || "Enhancement failed";
        failed.push({ sourceId, error: innerErr instanceof EnhanceError ? innerErr.message : msg });
      }
    };

    const queue = [...ids];
    let creditsExhausted = false;
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        if (creditsExhausted) {
          const id = queue.shift()!;
          failed.push({ sourceId: id, error: "Credits exhausted" });
          continue;
        }
        const id = queue.shift()!;
        try { await enhanceOne(id); }
        catch (err) {
          if (err instanceof AICreditError) creditsExhausted = true;
          if (!succeeded.some((s) => s.sourceId === id) && !failed.some((f) => f.sourceId === id)) {
            failed.push({ sourceId: id, error: "Unexpected error" });
          }
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(LIB_BULK_ENHANCE_CONCURRENCY, ids.length) }, () => worker()),
    );

    if (lastRemaining === null) {
      const u = await prisma.user.findUnique({
        where: { id: req.auth!.userId },
        select: { aiCredits: true, purchasedCredits: true },
      });
      lastRemaining = (u?.aiCredits ?? 0) + (u?.purchasedCredits ?? 0);
    }

    res.json({
      succeeded,
      failed,
      total: ids.length,
      remainingCredits: lastRemaining,
      scene: sceneText ? `custom` : scene,
    });
  } catch (err) {
    console.error("Library bulk-enhance error:", err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
