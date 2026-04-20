import { Router, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { ShopifyService, ShopifyAuthError, ShopifyApiError } from "../services/shopify";
import { tijarflowProductToShopify } from "../services/shopifyMapper";
import { SallaService, SallaAuthError, SallaApiError } from "../services/salla";
import { tijarflowProductToSalla } from "../services/sallaMapper";
import { signMediaPath, MEDIA_TTL_SHORT, MEDIA_TTL_MARKETPLACE } from "../lib/mediaSign";
import { enhanceWithGemini, fetchRemoteImage, readLocalMedia, backgroundScenes, EnhanceError } from "../lib/enhanceImage";
import { saveEnhancementToLibrary } from "../lib/imageStorage";
import { AICreditError, consumeWeeklyAICredit, refundOneCredit } from "../services/aiCredits";

function signProductImages<T extends { images?: unknown }>(product: T): T {
  if (!Array.isArray(product.images)) return product;
  const signed = (product.images as string[]).map((u) => {
    if (typeof u !== "string") return u;
    if (u.startsWith("/media/")) {
      const relPath = u.slice("/media/".length).split("?")[0];
      return signMediaPath(relPath, MEDIA_TTL_SHORT);
    }
    return u;
  });
  return { ...product, images: signed };
}

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

    res.json({ data: data.map(signProductImages), total, page, pageSize });
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

    res.json(signProductImages(product));
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

    res.status(201).json(signProductImages(product));
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

    const { title, price, currency, quantity, status, description, compareAtPrice, sku, barcode, images, category, productType, vendor, tags, weight, weightUnit } = req.body;
    const product = await prisma.product.update({
      where: { id: req.params.id as string },
      data: {
        ...(title !== undefined && { title }),
        ...(price !== undefined && { price }),
        ...(currency !== undefined && { currency }),
        ...(quantity !== undefined && { quantity }),
        ...(status !== undefined && { status }),
        ...(description !== undefined && { description }),
        ...(compareAtPrice !== undefined && { compareAtPrice }),
        ...(sku !== undefined && { sku }),
        ...(barcode !== undefined && { barcode }),
        ...(images !== undefined && { images }),
        ...(category !== undefined && { category }),
        ...(productType !== undefined && { productType }),
        ...(vendor !== undefined && { vendor }),
        ...(tags !== undefined && { tags }),
        ...(weight !== undefined && { weight }),
        ...(weightUnit !== undefined && { weightUnit }),
      },
    });

    res.json(signProductImages(product));
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

// POST /api/products/:id/enhance — enhance the product's first image and
// prepend the result to product.images. One credit per call. Also saves the
// enhanced image to the user's AI Studio library (folder: "Enhanced Products")
// so it shows up alongside manual enhancements.
router.post("/:id/enhance", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sceneInput = typeof req.body?.scene === "string" ? req.body.scene : "studio";
    const scene = backgroundScenes[sceneInput] ? sceneInput : "studio";

    const product = await prisma.product.findFirst({
      where: { id: req.params.id as string, userId: req.auth!.userId },
    });
    if (!product) {
      res.status(404).json({ error: "Product not found", code: "NOT_FOUND" });
      return;
    }

    const images = Array.isArray(product.images) ? (product.images as string[]) : [];
    const sourceUrl = images.find((u) => typeof u === "string" && u.length > 0);
    if (!sourceUrl) {
      res.status(400).json({ error: "This product has no image to enhance", code: "NO_SOURCE_IMAGE" });
      return;
    }

    // Pull source bytes — either local /media/... or a remote CDN URL.
    let source: { mimeType: string; base64: string };
    try {
      if (sourceUrl.startsWith("/media/")) {
        const rel = sourceUrl.slice("/media/".length).split("?")[0];
        source = await readLocalMedia(rel);
      } else if (/^https?:\/\//i.test(sourceUrl)) {
        source = await fetchRemoteImage(sourceUrl);
      } else {
        res.status(400).json({ error: "Unsupported image source", code: "NO_SOURCE_IMAGE" });
        return;
      }
    } catch (err) {
      if (err instanceof EnhanceError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }

    const creditUsage = await consumeWeeklyAICredit(prisma, req.auth!.userId);

    try {
      const output = await enhanceWithGemini({
        inputMime: source.mimeType,
        inputBase64: source.base64,
        scene,
      });

      const saved = await saveEnhancementToLibrary(prisma, {
        userId: req.auth!.userId,
        base64: output.base64,
        mimeType: output.mimeType,
        background: scene,
        folderName: "Enhanced Products",
      });

      const updated = await prisma.product.update({
        where: { id: product.id },
        data: { images: [saved.imageUrl, ...images] },
        include: { marketplaceConnection: { select: { id: true, platform: true, storeName: true } } },
      });

      res.json({
        product: signProductImages(updated),
        enhancedImageUrl: signMediaPath(saved.imagePath, MEDIA_TTL_SHORT),
        scene,
        remainingCredits: creditUsage.totalCredits,
        weeklyCredits: creditUsage.weeklyCredits,
        purchasedCredits: creditUsage.purchasedCredits,
      });
    } catch (innerErr) {
      await refundOneCredit(prisma, req.auth!.userId, creditUsage.usedPool);
      throw innerErr;
    }
  } catch (err: any) {
    if (err instanceof AICreditError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof EnhanceError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error("Product enhance error:", err);
    const message = err?.message || "";
    if (/Unable to process input image|INVALID_ARGUMENT|input image/i.test(message)) {
      res.status(400).json({
        error: "We couldn't process that image. Try a different source image (JPEG or PNG, at least 200×200 px).",
        code: "INVALID_IMAGE",
      });
      return;
    }
    res.status(500).json({ error: "Failed to enhance product image", code: "ENHANCE_ERROR" });
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

    const base = (process.env.PUBLIC_BASE_URL || "https://app.tijarflow.com").replace(/\/+$/, "");
    // For marketplace push we need Shopify/Salla to fetch the image over the
    // public internet, so relative /media/... paths get absolutized AND signed
    // with a 7-day TTL. External (already-http) URLs are passed through.
    const absolutize = (url: string): string => {
      if (/^https?:\/\//i.test(url)) return url;
      if (url.startsWith("/media/")) {
        const relPath = url.slice("/media/".length).split("?")[0];
        return `${base}${signMediaPath(relPath, MEDIA_TTL_MARKETPLACE)}`;
      }
      if (url.startsWith("/")) return `${base}${url}`;
      return url;
    };

    if (connection.platform === "SHOPIFY") {
      const shopify = new ShopifyService(connection, prisma);
      let pushed = 0;

      for (const product of products) {
        const payload = tijarflowProductToShopify(product, absolutize);

        if (product.platformProductId) {
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
      return;
    }

    if (connection.platform === "SALLA") {
      const salla = new SallaService(connection, prisma);
      let pushed = 0;

      for (const product of products) {
        const payload = tijarflowProductToSalla(
          {
            title: product.title,
            description: product.description,
            price: product.price,
            compareAtPrice: product.compareAtPrice,
            sku: product.sku,
            quantity: product.quantity,
            images: product.images,
            status: product.status,
            currency: product.currency,
          },
          absolutize,
        );

        if (product.platformProductId) {
          const updated = await salla.updateProduct(product.platformProductId, payload);
          await prisma.product.update({
            where: { id: product.id },
            data: {
              marketplaceConnectionId: connectionId,
              platformData: updated as unknown as Prisma.JsonObject,
              status: "ACTIVE",
            },
          });
        } else {
          const created = await salla.createProduct(payload);
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
        message: `Pushed ${pushed} product(s) to Salla`,
        count: pushed,
        platform: "SALLA",
      });
      return;
    }

    res.status(400).json({ error: "Unsupported platform", code: "VALIDATION_ERROR" });
  } catch (err) {
    if (err instanceof ShopifyAuthError || err instanceof SallaAuthError) {
      const code = err instanceof ShopifyAuthError ? "SHOPIFY_AUTH_ERROR" : "SALLA_AUTH_ERROR";
      res.status(400).json({ error: err.message, code });
    } else if (err instanceof ShopifyApiError || err instanceof SallaApiError) {
      const code = err instanceof ShopifyApiError ? "SHOPIFY_API_ERROR" : "SALLA_API_ERROR";
      res.status(502).json({ error: err.message, code });
    } else {
      console.error("Push error:", err);
      res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
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
