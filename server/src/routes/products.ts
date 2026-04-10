import { Router, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { ShopifyService, ShopifyAuthError, ShopifyApiError } from "../services/shopify";
import { tijarflowProductToShopify } from "../services/shopifyMapper";
import { GoogleGenAI } from "@google/genai";
import { AICreditError, consumeWeeklyAICredit } from "../services/aiCredits";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/products
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const marketplace = req.query.marketplace as string | undefined;

    const where: Prisma.ProductWhereInput = { userId: req.auth!.userId };

    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }
    if (status) {
      where.status = status as Prisma.EnumProductStatusFilter["equals"];
    }
    if (marketplace) {
      where.marketplaceConnection = { platform: marketplace as "SALLA" | "SHOPIFY" };
    }

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { marketplaceConnection: { select: { id: true, platform: true, storeName: true } } },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ data, total, page, pageSize });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /api/products/:id
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id as string, userId: req.auth!.userId },
      include: { marketplaceConnection: { select: { id: true, platform: true, storeName: true } } },
    });

    if (!product) {
      res.status(404).json({ error: "Product not found", code: "NOT_FOUND" });
      return;
    }

    res.json(product);
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/products
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, price, currency, quantity, status, ...rest } = req.body;

    if (!title || price === undefined || !currency || quantity === undefined || !status) {
      res.status(400).json({ error: "title, price, currency, quantity, and status are required", code: "VALIDATION_ERROR" });
      return;
    }

    const product = await prisma.product.create({
      data: {
        userId: req.auth!.userId!,
        title,
        price,
        currency,
        quantity,
        status,
        description: rest.description,
        compareAtPrice: rest.compareAtPrice,
        sku: rest.sku,
        barcode: rest.barcode,
        images: rest.images || [],
        category: rest.category,
        productType: rest.productType,
        vendor: rest.vendor,
        tags: rest.tags || [],
        weight: rest.weight,
        weightUnit: rest.weightUnit,
        marketplaceConnectionId: rest.marketplaceConnectionId,
        platformProductId: rest.platformProductId,
        platformData: rest.platformData,
      },
    });

    res.status(201).json(product);
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PUT /api/products/:id
router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id as string, userId: req.auth!.userId },
    });

    if (!existing) {
      res.status(404).json({ error: "Product not found", code: "NOT_FOUND" });
      return;
    }

    const product = await prisma.product.update({
      where: { id: req.params.id as string },
      data: req.body,
    });

    res.json(product);
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// DELETE /api/products/:id
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id as string, userId: req.auth!.userId },
    });

    if (!existing) {
      res.status(404).json({ error: "Product not found", code: "NOT_FOUND" });
      return;
    }

    await prisma.product.delete({ where: { id: req.params.id as string } });
    res.json({ message: "Product deleted" });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/products/push — push products to a marketplace
router.post("/push", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productIds, connectionId } = req.body as { productIds: string[]; connectionId: string };

    if (!productIds?.length || !connectionId) {
      res.status(400).json({ error: "productIds and connectionId are required", code: "VALIDATION_ERROR" });
      return;
    }

    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, userId: req.auth!.userId },
    });

    if (!connection) {
      res.status(404).json({ error: "Marketplace connection not found", code: "NOT_FOUND" });
      return;
    }

    if (connection.status !== "CONNECTED") {
      res.status(400).json({ error: "Marketplace is not connected", code: "VALIDATION_ERROR" });
      return;
    }

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, userId: req.auth!.userId },
    });

    if (products.length === 0) {
      res.status(404).json({ error: "No valid products found", code: "NOT_FOUND" });
      return;
    }

    if (connection.platform === "SHOPIFY") {
      const shopify = new ShopifyService(connection, prisma);
      let pushed = 0;

      // Process sequentially to respect rate limits
      for (const product of products) {
        const payload = tijarflowProductToShopify(product);

        if (product.platformProductId) {
          // Update existing product on Shopify
          const updated = await shopify.updateProduct(product.platformProductId, payload);
          await prisma.product.update({
            where: { id: product.id },
            data: {
              marketplaceConnectionId: connectionId,
              platformData: updated as unknown as Prisma.JsonObject,
              status: "ACTIVE",
            },
          });
        } else {
          // Create new product on Shopify
          const created = await shopify.createProduct(payload);
          await prisma.product.update({
            where: { id: product.id },
            data: {
              marketplaceConnectionId: connectionId,
              platformProductId: String(created.id),
              platformData: created as unknown as Prisma.JsonObject,
              status: "ACTIVE",
            },
          });
        }
        pushed++;
      }

      res.json({
        message: `Pushed ${pushed} product(s) to Shopify`,
        count: pushed,
        platform: "SHOPIFY",
      });
    } else {
      // SALLA — still simulated for now
      const updated = await Promise.all(
        products.map((product) =>
          prisma.product.update({
            where: { id: product.id },
            data: {
              marketplaceConnectionId: connectionId,
              platformProductId: product.platformProductId || `salla_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              status: "ACTIVE",
            },
          })
        )
      );

      res.json({
        message: `Pushed ${updated.length} product(s) to Salla`,
        count: updated.length,
        platform: "SALLA",
      });
    }
  } catch (err) {
    if (err instanceof ShopifyAuthError) {
      res.status(400).json({ error: err.message, code: "SHOPIFY_AUTH_ERROR" });
    } else if (err instanceof ShopifyApiError) {
      res.status(502).json({ error: err.message, code: "SHOPIFY_API_ERROR" });
    } else {
      res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  }
});

// POST /api/products/enhance-image — AI image enhancement using Gemini 2.5 Flash Image
router.post("/enhance-image", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { image, title, description, background } = req.body;

    if (!image) {
      res.status(400).json({ error: "Please upload an image first to enhance it", code: "VALIDATION_ERROR" });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: "GEMINI_API_KEY is not set", code: "CONFIG_ERROR" });
      return;
    }

    const creditUsage = await consumeWeeklyAICredit(prisma, req.auth!.userId);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Background scene descriptions
    const backgroundScenes: Record<string, string> = {
      studio: "a clean pure white studio background with professional soft-box lighting and a subtle shadow underneath the product",
      kitchen: "a modern luxury kitchen countertop with marble surface, warm ambient lighting, and slightly blurred kitchen appliances in the background",
      mall: "a premium shopping mall display shelf with elegant retail store lighting, soft spotlights, and glass shelving",
      outdoor: "a beautiful outdoor setting with soft golden-hour sunlight and a lush green bokeh background",
      living_room: "a cozy modern living room with stylish furniture, warm natural light coming from large windows",
      office: "a sleek modern office desk with clean workspace, minimalist decor, and professional lighting",
      nature: "a natural organic setting with a wooden surface, fresh green leaves and plants in soft-focus background",
      gradient: "a smooth gradient background with soft pastel tones, clean and modern with no distractions",
    };

    const sceneName = background && backgroundScenes[background] ? background : "studio";
    const sceneDescription = backgroundScenes[sceneName];

    // Image-to-image editing prompt — keeps the product identical, only improves quality and changes background
    const productContext = title
      ? `This is a product photo of: ${title}${description ? `. ${description}` : ""}.`
      : "This is a product photo.";

    const finalPrompt = `${productContext} Edit this product image with the following instructions:

1. KEEP THE PRODUCT EXACTLY AS IT IS — do NOT change, modify, or regenerate the product itself. The product must remain pixel-perfect identical in shape, color, texture, and every detail.
2. REMOVE the current background completely.
3. REPLACE the background with: ${sceneDescription}.
4. IMPROVE the overall image quality: enhance sharpness, fix lighting to look professional, improve color balance, and increase clarity.
5. Make the product look like it was photographed by a professional e-commerce photographer.
6. Do NOT add any text, watermarks, or logos.
7. The final result should look like a high-quality, professional product photograph.`;

    // Build request contents — image FIRST so the model focuses on editing it
    const match = image.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = match ? match[1] : "image/jpeg";
    const base64Data = match ? match[2] : image.split(",")[1] || image;

    const contents: any[] = [
      { inlineData: { mimeType, data: base64Data } },
      finalPrompt,
    ];

    // Generate enhanced image using Gemini 2.5 Flash Image model
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
      config: {
        responseModalities: ["image", "text"],
      },
    });

    // Extract image from response parts
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No response parts returned.");

    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
    if (!imagePart?.inlineData) throw new Error("No image data in response.");

    const outputMimeType = imagePart.inlineData.mimeType || "image/png";
    const base64 = imagePart.inlineData.data;

    res.json({
      image: `data:${outputMimeType};base64,${base64}`,
      prompt: finalPrompt,
      remainingCredits: creditUsage.remainingCredits,
      creditsResetWeek: creditUsage.resetWeek,
    });
  } catch (err: any) {
    if (err instanceof AICreditError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error("Enhance Image Error:", err);
    res.status(500).json({ error: err.message || "Failed to enhance image", code: "ENHANCE_ERROR" });
  }
});

// PATCH /api/products/bulk
router.patch("/bulk", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ids, action } = req.body as { ids: string[]; action: string };

    if (!ids?.length || !action) {
      res.status(400).json({ error: "ids and action are required", code: "VALIDATION_ERROR" });
      return;
    }

    const where = { id: { in: ids }, userId: req.auth!.userId };

    if (action === "delete") {
      const result = await prisma.product.deleteMany({ where });
      res.json({ message: `Deleted ${result.count} products` });
      return;
    }

    const statusMap: Record<string, string> = {
      activate: "ACTIVE",
      archive: "ARCHIVED",
      draft: "DRAFT",
    };

    const newStatus = statusMap[action];
    if (!newStatus) {
      res.status(400).json({ error: "Invalid action", code: "VALIDATION_ERROR" });
      return;
    }

    const result = await prisma.product.updateMany({
      where,
      data: { status: newStatus as "ACTIVE" | "DRAFT" | "ARCHIVED" },
    });

    res.json({ message: `Updated ${result.count} products` });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
