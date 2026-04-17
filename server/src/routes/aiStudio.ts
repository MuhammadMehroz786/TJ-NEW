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

export default router;
