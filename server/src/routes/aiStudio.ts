import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { AICreditError, consumeWeeklyAICredit } from "../services/aiCredits";

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

function parseBase64Image(input: string): { mimeType: string; base64: string; ext: string } {
  const match = input.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match ? match[1] : "image/png";
  const base64 = match ? match[2] : input.split(",")[1] || input;
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
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 24));

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

    res.json({ data, total, page, pageSize });
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

    const creditUsage = await consumeWeeklyAICredit(prisma, req.auth!.userId);

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

    const parsedInput = parseBase64Image(image);
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

    const outputMimeType = imagePart.inlineData.mimeType || "image/png";
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
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
      ...record,
      remainingCredits: creditUsage.totalCredits,
      weeklyCredits: creditUsage.weeklyCredits,
      purchasedCredits: creditUsage.purchasedCredits,
      creditsResetWeek: creditUsage.resetWeek,
    });
  } catch (err: any) {
    if (err instanceof AICreditError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error("AI Studio enhance error:", err);
    res.status(500).json({ error: err.message || "Failed to enhance image", code: "ENHANCE_ERROR" });
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
    res.json(updated);
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
    res.json({ data });
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
