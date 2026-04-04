import { Router, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { ShopifyService, ShopifyAuthError, ShopifyApiError } from "../services/shopify";
import { tijarflowProductToShopify } from "../services/shopifyMapper";

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
