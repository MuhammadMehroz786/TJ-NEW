import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { generateSallaProducts } from "../services/mockData";
import { ShopifyService, ShopifyAuthError, ShopifyApiError } from "../services/shopify";
import { shopifyProductToTijarflow } from "../services/shopifyMapper";
import { encrypt } from "../lib/crypto";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// Sanitized fields to return (never leak tokens/secrets)
const safeSelect = {
  id: true,
  platform: true,
  storeName: true,
  storeUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true } },
};

// GET /api/marketplaces
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const connections = await prisma.marketplaceConnection.findMany({
      where: { userId: req.auth!.userId },
      select: safeSelect,
      orderBy: { createdAt: "desc" },
    });

    res.json(connections);
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/marketplaces/connect
router.post("/connect", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { platform, storeName, storeUrl } = req.body;

    if (!platform || !storeName || !storeUrl) {
      res.status(400).json({ error: "platform, storeName, and storeUrl are required", code: "VALIDATION_ERROR" });
      return;
    }

    if (!["SALLA", "SHOPIFY"].includes(platform)) {
      res.status(400).json({ error: "Platform must be SALLA or SHOPIFY", code: "VALIDATION_ERROR" });
      return;
    }

    // Check for duplicate store URL
    const normalizedUrl = platform === "SHOPIFY"
      ? `https://${storeUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
      : storeUrl;

    const existing = await prisma.marketplaceConnection.findUnique({
      where: { userId_storeUrl: { userId: req.auth!.userId, storeUrl: normalizedUrl } },
    });

    if (existing) {
      res.status(409).json({ error: `This store is already connected`, code: "CONFLICT" });
      return;
    }

    if (platform === "SHOPIFY") {
      const { clientId, clientSecret } = req.body;

      if (!clientId || !clientSecret) {
        res.status(400).json({ error: "clientId and clientSecret are required for Shopify", code: "VALIDATION_ERROR" });
        return;
      }

      // Validate storeUrl format
      const cleanUrl = storeUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      if (!cleanUrl.includes(".myshopify.com")) {
        res.status(400).json({ error: "Store URL must be a .myshopify.com domain", code: "VALIDATION_ERROR" });
        return;
      }

      // Exchange credentials for access token to validate them
      let accessToken: string;
      let expiresIn: number;
      try {
        const tokenRes = await fetch(`https://${cleanUrl}/admin/oauth/access_token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });

        if (!tokenRes.ok) {
          res.status(400).json({
            error: "Invalid Shopify credentials - check your API Key and Secret",
            code: "SHOPIFY_AUTH_ERROR",
          });
          return;
        }

        const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
        accessToken = tokenData.access_token;
        expiresIn = tokenData.expires_in;
      } catch {
        res.status(400).json({
          error: "Could not reach Shopify - check your store URL",
          code: "SHOPIFY_AUTH_ERROR",
        });
        return;
      }

      const connection = await prisma.marketplaceConnection.create({
        data: {
          userId: req.auth!.userId,
          platform: "SHOPIFY",
          storeName,
          storeUrl: `https://${cleanUrl}`,
          accessToken: encrypt(accessToken),
          clientId,
          clientSecret: encrypt(clientSecret),
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          status: "CONNECTED",
        },
        select: safeSelect,
      });

      res.status(201).json(connection);
    } else {
      // SALLA - keep existing behavior
      const { accessToken } = req.body;
      if (!accessToken) {
        res.status(400).json({ error: "accessToken is required for Salla", code: "VALIDATION_ERROR" });
        return;
      }

      const connection = await prisma.marketplaceConnection.create({
        data: {
          userId: req.auth!.userId,
          platform: "SALLA",
          storeName,
          storeUrl,
          accessToken,
          status: "CONNECTED",
        },
        select: safeSelect,
      });

      res.status(201).json(connection);
    }
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// DELETE /api/marketplaces/:id
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: req.params.id as string, userId: req.auth!.userId },
    });

    if (!connection) {
      res.status(404).json({ error: "Connection not found", code: "NOT_FOUND" });
      return;
    }

    await prisma.product.deleteMany({ where: { marketplaceConnectionId: connection.id } });
    await prisma.marketplaceConnection.delete({ where: { id: connection.id } });

    res.json({ message: "Marketplace disconnected" });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/marketplaces/:id/sync
router.post("/:id/sync", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: req.params.id as string, userId: req.auth!.userId },
    });

    if (!connection) {
      res.status(404).json({ error: "Connection not found", code: "NOT_FOUND" });
      return;
    }

    if (connection.platform === "SALLA") {
      // Keep mock data for Salla
      await prisma.product.deleteMany({ where: { marketplaceConnectionId: connection.id } });
      const products = generateSallaProducts(connection.id, req.auth!.userId);
      await prisma.product.createMany({ data: products });
      res.json({ message: `Synced ${products.length} products from SALLA`, count: products.length });
      return;
    }

    // SHOPIFY - real API sync
    const shopify = new ShopifyService(connection, prisma);
    let totalSynced = 0;
    let pageInfo: string | undefined;
    const maxProducts = Math.min(parseInt(req.query.limit as string) || 250, 1000);

    do {
      const fetchLimit = Math.min(250, maxProducts - totalSynced);
      if (fetchLimit <= 0) break;
      const page = await shopify.fetchProducts(fetchLimit, pageInfo);

      for (const sp of page.products) {
        const productData = shopifyProductToTijarflow(sp, connection.id, req.auth!.userId);

        // Upsert: find by platformProductId + connectionId, or by sku + userId
        const existing = await prisma.product.findFirst({
          where: {
            OR: [
              { platformProductId: String(sp.id), marketplaceConnectionId: connection.id },
              ...(productData.sku ? [{ sku: productData.sku, userId: req.auth!.userId }] : []),
            ],
          },
        });

        const updateData = {
          title: productData.title,
          description: productData.description,
          price: productData.price,
          compareAtPrice: productData.compareAtPrice,
          sku: productData.sku,
          barcode: productData.barcode,
          quantity: productData.quantity,
          weight: productData.weight,
          weightUnit: productData.weightUnit,
          images: productData.images,
          tags: productData.tags,
          productType: productData.productType,
          vendor: productData.vendor,
          status: productData.status,
          platformData: productData.platformData,
          marketplaceConnectionId: connection.id,
          platformProductId: String(sp.id),
        };

        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: updateData,
          });
        } else {
          await prisma.product.create({ data: productData });
        }
        totalSynced++;
      }

      pageInfo = page.nextPageInfo;
    } while (pageInfo && totalSynced < maxProducts);

    res.json({ message: `Synced ${totalSynced} products from Shopify`, count: totalSynced });
  } catch (err) {
    if (err instanceof ShopifyAuthError) {
      await prisma.marketplaceConnection.update({
        where: { id: req.params.id as string },
        data: { status: "DISCONNECTED" },
      });
      res.status(400).json({ error: err.message, code: "SHOPIFY_AUTH_ERROR" });
    } else if (err instanceof ShopifyApiError) {
      res.status(502).json({ error: err.message, code: "SHOPIFY_API_ERROR" });
    } else {
      console.error("Sync error:", err);
      res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  }
});

export default router;
