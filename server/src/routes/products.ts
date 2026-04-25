import { Router, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
// multer ships its own @types which pull in a second @types/express-serve-static-core
// tree — that conflicts with the one used by express-rate-limit elsewhere in
// this project. We don't need multer's types here (only multer.memoryStorage
// and single()), so we require it untyped to keep the @types graph clean.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const multer = require("multer") as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require("adm-zip") as any;
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { authenticate, AuthRequest } from "../middleware/auth";
import { ShopifyService, ShopifyAuthError, ShopifyApiError } from "../services/shopify";
import { tijarflowProductToShopify } from "../services/shopifyMapper";
import { SallaService, SallaAuthError, SallaApiError } from "../services/salla";
import { tijarflowProductToSalla } from "../services/sallaMapper";
import { signMediaPath, MEDIA_TTL_SHORT, MEDIA_TTL_MARKETPLACE } from "../lib/mediaSign";
import { enhanceWithGemini, fetchRemoteImage, readLocalMedia, decodeDataUri, backgroundScenes, EnhanceError } from "../lib/enhanceImage";
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

// POST /api/products/bulk-import — create many products in one call. Accepts
// an array of rows already parsed on the client (CSV → JSON). Each row is
// validated independently; valid rows are created in a single transaction and
// invalid rows are returned with a per-row error so the merchant can fix them.
//
// Body: { rows: Array<{ title, price, quantity?, sku?, currency?, status?,
//   description?, compareAtPrice?, category?, vendor?, tags?, imageUrl? }> }
interface BulkImportRow {
  title?: unknown;
  price?: unknown;
  quantity?: unknown;
  sku?: unknown;
  currency?: unknown;
  status?: unknown;
  description?: unknown;
  compareAtPrice?: unknown;
  category?: unknown;
  productType?: unknown;
  vendor?: unknown;
  tags?: unknown;
  imageUrl?: unknown;
}

const MAX_IMPORT_ROWS = 500;
const MAX_ZIP_BYTES = 100 * 1024 * 1024;          // 100 MB compressed
const MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024;     // 10 MB per image (decoded)
const MAX_ZIP_ENTRIES = 2000;                     // sanity cap
const IMAGE_EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

// Multer accepts a zip + a JSON text field for rows. Stored in memory — images
// get streamed to disk ourselves because we rename them by SKU match.
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_BYTES, files: 1 },
}).single("zip");

// Detect image mime by magic bytes. Used to reject non-image files smuggled
// inside the ZIP (e.g. an .exe renamed to .jpg).
function detectImageMimeFromBytes(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

/**
 * Walk a ZIP buffer and return a map: `SKU-001` → array of saved /media URLs,
 * ordered by the filename suffix (`-1`, `-2`, etc.). Files are written to
 * `storage/products/{userId}/...` with a random name so the original filename
 * can't be used for directory-traversal or collisions.
 *
 * Filename convention (case-insensitive, whitespace trimmed):
 *   SKU-001.jpg              → primary image
 *   SKU-001-2.jpg, SKU-001_2 → additional images in order
 *
 * Entries that don't have a matching SKU or aren't valid images are ignored
 * and counted in `unmatched` / `invalid` — those are surfaced in the response
 * so the merchant can fix filenames.
 */
async function extractProductImagesFromZip(
  zipBuf: Buffer,
  userId: string,
  knownSkus: Set<string>,
): Promise<{
  bySku: Map<string, string[]>;
  matched: number;
  unmatched: string[];
  invalid: string[];
}> {
  const zip = new AdmZip(zipBuf);
  const entries = zip.getEntries();
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP contains ${entries.length} entries — max ${MAX_ZIP_ENTRIES} allowed`);
  }

  const storageRoot = path.resolve(process.cwd(), "storage");
  const relativeDir = path.join("products", userId);
  const absDir = path.join(storageRoot, relativeDir);
  await fsp.mkdir(absDir, { recursive: true });

  // Buffer per-SKU matches first so we can sort by the trailing index before
  // writing. e.g. SKU-001-2 should land at images[1], not in arrival order.
  const buckets = new Map<string, { order: number; url: string }[]>();
  const unmatched: string[] = [];
  const invalid: string[] = [];
  let matched = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    // Strip any path prefix — we only care about the basename. This also
    // neutralises path traversal attempts like ../../etc/passwd.jpg.
    const name = path.basename(entry.entryName);
    if (!name || name.startsWith(".")) continue;

    const ext = path.extname(name).toLowerCase();
    const expectedMime = IMAGE_EXT_MIME[ext];
    if (!expectedMime) {
      invalid.push(name);
      continue;
    }

    const stem = name.slice(0, name.length - ext.length).trim();
    // Match pattern: optional trailing -N or _N indicates image order
    const orderMatch = stem.match(/^(.+?)[-_](\d+)$/);
    const skuKey = (orderMatch ? orderMatch[1] : stem).trim().toLowerCase();
    const order = orderMatch ? parseInt(orderMatch[2], 10) : 1;

    if (!knownSkus.has(skuKey)) {
      unmatched.push(name);
      continue;
    }

    const data = entry.getData();
    if (data.length === 0 || data.length > MAX_ZIP_ENTRY_BYTES) {
      invalid.push(name);
      continue;
    }
    const actualMime = detectImageMimeFromBytes(data);
    if (!actualMime) {
      invalid.push(name);
      continue;
    }

    const outExt = actualMime === "image/png" ? "png" : actualMime === "image/jpeg" ? "jpg" : "webp";
    const randomName = `${Date.now()}-${crypto.randomUUID()}.${outExt}`;
    const relPath = path.join(relativeDir, randomName).replaceAll("\\", "/");
    const absPath = path.join(storageRoot, relPath);
    await fsp.writeFile(absPath, data);

    const bucket = buckets.get(skuKey) ?? [];
    bucket.push({ order, url: `/media/${relPath}` });
    buckets.set(skuKey, bucket);
    matched++;
  }

  const bySku = new Map<string, string[]>();
  for (const [sku, list] of buckets.entries()) {
    list.sort((a, b) => a.order - b.order);
    bySku.set(sku, list.map((x) => x.url));
  }

  return { bySku, matched, unmatched, invalid };
}

router.post("/bulk-import", importUpload, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Two content types supported:
    //   1. multipart/form-data with fields: rows (JSON string), zip (file, optional)
    //   2. application/json with { rows: [...] }  — legacy path, still used when
    //      the merchant doesn't have a ZIP to send
    let rows: BulkImportRow[] | null = null;
    const file = (req as AuthRequest & { file?: { buffer?: Buffer; originalname?: string; size?: number } }).file;

    if (typeof req.body?.rows === "string") {
      try {
        const parsed = JSON.parse(req.body.rows);
        if (Array.isArray(parsed)) rows = parsed as BulkImportRow[];
      } catch {
        res.status(400).json({ error: "rows field is not valid JSON", code: "VALIDATION_ERROR" });
        return;
      }
    } else if (Array.isArray(req.body?.rows)) {
      rows = req.body.rows as BulkImportRow[];
    }

    if (!rows || rows.length === 0) {
      res.status(400).json({ error: "rows array is required", code: "VALIDATION_ERROR" });
      return;
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      res.status(400).json({
        error: `Too many rows. Max ${MAX_IMPORT_ROWS} per import — split your file and try again.`,
        code: "TOO_MANY_ROWS",
      });
      return;
    }

    const statusValues = new Set(["DRAFT", "ACTIVE", "ARCHIVED"]);
    const toDataOrError = (row: BulkImportRow, index: number): { ok: true; data: Prisma.ProductCreateManyInput } | { ok: false; error: string; index: number } => {
      const title = typeof row.title === "string" ? row.title.trim() : "";
      if (!title) return { ok: false, error: "Missing title", index };
      if (title.length > 255) return { ok: false, error: "Title too long (max 255 chars)", index };

      const priceNum = typeof row.price === "number" ? row.price : parseFloat(String(row.price ?? ""));
      if (!Number.isFinite(priceNum) || priceNum < 0) return { ok: false, error: "Price must be a non-negative number", index };

      const qtyRaw = row.quantity;
      const qtyNum = qtyRaw === undefined || qtyRaw === null || qtyRaw === "" ? 0 : parseInt(String(qtyRaw));
      if (!Number.isFinite(qtyNum) || qtyNum < 0) return { ok: false, error: "Quantity must be a non-negative integer", index };

      const statusRaw = typeof row.status === "string" ? row.status.trim().toUpperCase() : "DRAFT";
      const status = statusValues.has(statusRaw) ? statusRaw : "DRAFT";

      const currency = (typeof row.currency === "string" && row.currency.trim()) || "SAR";

      const compareAtPriceRaw = row.compareAtPrice;
      let compareAtPrice: number | null = null;
      if (compareAtPriceRaw !== undefined && compareAtPriceRaw !== null && compareAtPriceRaw !== "") {
        const n = typeof compareAtPriceRaw === "number" ? compareAtPriceRaw : parseFloat(String(compareAtPriceRaw));
        if (!Number.isFinite(n) || n < 0) return { ok: false, error: "compareAtPrice must be a non-negative number", index };
        compareAtPrice = n;
      }

      const tagsRaw = row.tags;
      let tags: string[] = [];
      if (Array.isArray(tagsRaw)) {
        tags = tagsRaw.filter((t) => typeof t === "string").map((t) => (t as string).trim().toLowerCase()).filter(Boolean);
      } else if (typeof tagsRaw === "string" && tagsRaw.trim()) {
        tags = tagsRaw.split(/[,;|]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
      }

      const imageUrlRaw = typeof row.imageUrl === "string" ? row.imageUrl.trim() : "";
      const images = imageUrlRaw && /^https?:\/\//i.test(imageUrlRaw) ? [imageUrlRaw] : [];

      return {
        ok: true,
        data: {
          userId: req.auth!.userId!,
          title,
          price: new Prisma.Decimal(priceNum.toFixed(2)),
          currency: currency.toUpperCase().slice(0, 8),
          quantity: qtyNum,
          status: status as "DRAFT" | "ACTIVE" | "ARCHIVED",
          description: typeof row.description === "string" ? row.description : null,
          compareAtPrice: compareAtPrice !== null ? new Prisma.Decimal(compareAtPrice.toFixed(2)) : null,
          sku: typeof row.sku === "string" && row.sku.trim() ? row.sku.trim() : null,
          category: typeof row.category === "string" && row.category.trim() ? row.category.trim() : null,
          productType: typeof row.productType === "string" && row.productType.trim() ? row.productType.trim() : null,
          vendor: typeof row.vendor === "string" && row.vendor.trim() ? row.vendor.trim() : null,
          tags: tags as unknown as Prisma.InputJsonValue,
          images: images as unknown as Prisma.InputJsonValue,
        },
      };
    };

    const valid: Prisma.ProductCreateManyInput[] = [];
    const errors: { row: number; error: string }[] = [];
    rows.forEach((row, i) => {
      const result = toDataOrError(row, i);
      if (result.ok) valid.push(result.data);
      else errors.push({ row: i + 1, error: result.error });
    });

    // If a ZIP was uploaded, match its images to rows by SKU filename and
    // attach the resulting /media URLs. ZIP images win over any imageUrl in
    // the CSV (because the merchant explicitly uploaded the photo).
    let zipStats: { matched: number; unmatched: string[]; invalid: string[] } | null = null;
    if (file && file.buffer && file.buffer.length > 0) {
      const knownSkus = new Set<string>();
      for (const r of valid) {
        if (typeof r.sku === "string" && r.sku.trim()) knownSkus.add(r.sku.trim().toLowerCase());
      }
      if (knownSkus.size === 0) {
        res.status(400).json({
          error: "ZIP upload requires a 'sku' column in your CSV so photos can be matched to products.",
          code: "SKU_REQUIRED_FOR_ZIP",
        });
        return;
      }
      try {
        const extracted = await extractProductImagesFromZip(file.buffer, req.auth!.userId!, knownSkus);
        zipStats = {
          matched: extracted.matched,
          unmatched: extracted.unmatched.slice(0, 20),
          invalid: extracted.invalid.slice(0, 20),
        };
        for (const r of valid) {
          const key = typeof r.sku === "string" ? r.sku.trim().toLowerCase() : "";
          const zipImages = key ? extracted.bySku.get(key) : undefined;
          if (zipImages && zipImages.length > 0) {
            r.images = zipImages as unknown as Prisma.InputJsonValue;
          }
        }
      } catch (zipErr: any) {
        res.status(400).json({
          error: zipErr?.message || "Couldn't read the ZIP file",
          code: "INVALID_ZIP",
        });
        return;
      }
    }

    let created = 0;
    if (valid.length > 0) {
      // skipDuplicates: a second row with the same [sku, userId] unique combo
      // is silently dropped rather than failing the whole batch.
      const result = await prisma.product.createMany({ data: valid, skipDuplicates: true });
      created = result.count;
    }

    res.json({
      created,
      skipped: valid.length - created,
      errors,
      total: rows.length,
      photos: zipStats,
      message: `Imported ${created} product(s)${errors.length ? `, ${errors.length} row(s) had errors` : ""}${zipStats ? ` · ${zipStats.matched} photo(s) matched` : ""}`,
    });
  } catch (err: any) {
    if (err?.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: `ZIP is too large (max ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB)`, code: "ZIP_TOO_LARGE" });
      return;
    }
    console.error("Bulk import error:", err);
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
    const sceneText = typeof req.body?.sceneText === "string" && req.body.sceneText.trim()
      ? req.body.sceneText.trim()
      : undefined;

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

    // Pull source bytes — local /media/..., remote CDN URL, or an inline
    // base64 data URI (legacy products often store images this way).
    let source: { mimeType: string; base64: string };
    try {
      if (sourceUrl.startsWith("/media/")) {
        const rel = sourceUrl.slice("/media/".length).split("?")[0];
        source = await readLocalMedia(rel);
      } else if (sourceUrl.startsWith("data:")) {
        source = decodeDataUri(sourceUrl);
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
        sceneText,
      });

      const saved = await saveEnhancementToLibrary(prisma, {
        userId: req.auth!.userId,
        base64: output.base64,
        mimeType: output.mimeType,
        background: sceneText ? `custom: ${sceneText.slice(0, 80)}` : scene,
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

// POST /api/products/bulk-enhance — run AI Studio enhancement on the first
// image of many products in one call. Same per-product logic as the single
// /:id/enhance endpoint, but fans out with a concurrency cap so a batch of 50
// doesn't hit Gemini's rate limit or blow up server memory.
//
// Body: {
//   productIds: string[],
//   scene?: string,
//   mode?: "prepend" | "overwrite" | "new"   // default: prepend
// }
//   - prepend:   the enhanced image is added in front of the product's
//                existing images[], keeping the old ones (default, safe)
//   - overwrite: the product's images[] is replaced with just the new one
//                — the old images are no longer attached to the product
//   - new:       leave the original product untouched; create a fresh
//                product that copies every field except images/sku/platform
//                IDs, appends "(AI)" to the title, and adds an "ai-enhanced"
//                tag so the merchant can filter for them
//
// Response: {
//   succeeded: { productId, enhancedImageUrl, newProductId? }[],
//   failed:    { productId, error }[],
//   remainingCredits: number,
// }
const BULK_ENHANCE_CONCURRENCY = 3;
const BULK_ENHANCE_MAX_IDS = 50;

router.post("/bulk-enhance", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = req.body as { productIds?: unknown; scene?: unknown; mode?: unknown; sceneText?: unknown; allImages?: unknown };
    const ids = Array.isArray(body.productIds)
      ? body.productIds.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    const modeRaw = typeof body.mode === "string" ? body.mode : "prepend";
    const mode: "prepend" | "overwrite" | "new" =
      modeRaw === "overwrite" || modeRaw === "new" ? modeRaw : "prepend";
    const sceneText = typeof body.sceneText === "string" && body.sceneText.trim() ? body.sceneText.trim() : undefined;
    // When true, every image on the product is enhanced and counted as 1
    // credit each. When false (default), only the cover image is processed
    // for 1 credit total — matches the legacy "Cover only" behavior so
    // existing users see no surprise credit deductions.
    const allImages = body.allImages === true;
    if (ids.length === 0) {
      res.status(400).json({ error: "productIds array is required", code: "VALIDATION_ERROR" });
      return;
    }
    if (ids.length > BULK_ENHANCE_MAX_IDS) {
      res.status(400).json({
        error: `Too many products. Max ${BULK_ENHANCE_MAX_IDS} per batch — select fewer and try again.`,
        code: "TOO_MANY_PRODUCTS",
      });
      return;
    }

    const sceneInput = typeof body.scene === "string" ? body.scene : "studio";
    const scene = backgroundScenes[sceneInput] ? sceneInput : "studio";

    // Fetch all products once (owner-scoped). We'll dispatch per-product
    // enhancement in parallel with a concurrency cap — failures don't stop
    // the rest, and credits are consumed/refunded per-product.
    // For mode="new" we need the full product to clone it; for the other
    // modes only id + images are enough.
    const products = mode === "new"
      ? await prisma.product.findMany({
          where: { id: { in: ids }, userId: req.auth!.userId },
        })
      : await prisma.product.findMany({
          where: { id: { in: ids }, userId: req.auth!.userId },
          select: { id: true, images: true },
        });
    const foundMap = new Map<string, typeof products[number]>(products.map((p) => [p.id, p]));

    const succeeded: { productId: string; enhancedImageUrl: string; newProductId?: string }[] = [];
    const failed: { productId: string; error: string }[] = [];
    let lastRemainingCredits: number | null = null;

    // Resolve any product image URL (local /media, https, or data: URI) to
    // raw bytes. Pulled out of enhanceOne so it can be called per-image when
    // allImages=true. Returns null if the URL shape isn't supported.
    const loadImageBytes = async (url: string): Promise<{ mimeType: string; base64: string } | null> => {
      try {
        if (url.startsWith("/media/")) {
          const rel = url.slice("/media/".length).split("?")[0];
          return await readLocalMedia(rel);
        } else if (url.startsWith("data:")) {
          return decodeDataUri(url);
        } else if (/^https?:\/\//i.test(url)) {
          return await fetchRemoteImage(url);
        }
      } catch {
        return null;
      }
      return null;
    };

    // Process one product — possibly multiple images if allImages=true.
    // Each image consumes 1 credit, refunds individually on Gemini failure,
    // and the final write to the product depends on `mode`:
    //   • prepend:   all newly-enhanced URLs go in front of existing images[]
    //   • overwrite: images[] becomes JUST the newly-enhanced URLs (originals discarded)
    //   • new:       one new draft product gets ALL the newly-enhanced URLs
    const enhanceOne = async (productId: string): Promise<void> => {
      const product = foundMap.get(productId);
      if (!product) {
        failed.push({ productId, error: "Product not found" });
        return;
      }
      const productImages = Array.isArray(product.images) ? (product.images as string[]) : [];
      const validImages = productImages.filter((u): u is string => typeof u === "string" && u.length > 0);
      if (validImages.length === 0) {
        failed.push({ productId, error: "No source image" });
        return;
      }

      // Decide which input images to process.
      const inputUrls = allImages ? validImages : [validImages[0]];
      const enhancedUrls: string[] = [];   // /media/... URLs of successful outputs (in order)
      let lastSavedImagePath: string | null = null;
      let imagesEnhanced = 0;
      let imagesFailed = 0;

      for (let i = 0; i < inputUrls.length; i++) {
        const url = inputUrls[i];

        const source = await loadImageBytes(url);
        if (!source) {
          imagesFailed++;
          console.warn(`[bulk-enhance] product ${productId} image ${i} unsupported source`);
          continue;
        }

        // Consume 1 credit per image. If credits run out mid-product, refund
        // none (they were validly used) but stop processing further images
        // for this product and let the outer loop know.
        let creditUsage;
        try {
          creditUsage = await consumeWeeklyAICredit(prisma, req.auth!.userId);
        } catch (err) {
          // Credits exhausted. Record the rest of this product's images as
          // failed-due-to-credits, then re-throw so the outer worker knows
          // and can short-circuit subsequent products too.
          for (let j = i; j < inputUrls.length; j++) imagesFailed++;
          if (imagesEnhanced === 0) {
            failed.push({ productId, error: err instanceof AICreditError ? err.message : "Credit check failed" });
          }
          throw err;
        }

        try {
          const output = await enhanceWithGemini({
            inputMime: source.mimeType,
            inputBase64: source.base64,
            scene,
            sceneText,
          });
          const saved = await saveEnhancementToLibrary(prisma, {
            userId: req.auth!.userId,
            base64: output.base64,
            mimeType: output.mimeType,
            background: sceneText ? `custom: ${sceneText.slice(0, 80)}` : scene,
            folderName: "Enhanced Products",
          });
          enhancedUrls.push(saved.imageUrl);
          lastSavedImagePath = saved.imagePath;
          imagesEnhanced++;
          lastRemainingCredits = creditUsage.totalCredits;
        } catch (innerErr: any) {
          await refundOneCredit(prisma, req.auth!.userId, creditUsage.usedPool);
          imagesFailed++;
          const message = innerErr?.message || "Enhancement failed";
          console.error(`[bulk-enhance] product ${productId} image ${i} failed:`, message, innerErr?.code);
        }
      }

      // If nothing succeeded, this product as a whole is a failure.
      if (enhancedUrls.length === 0) {
        failed.push({
          productId,
          error: imagesFailed > 0 ? "All images rejected by Gemini" : "No source images could be loaded",
        });
        return;
      }

      // Apply the final write per mode. One DB write per product regardless of
      // how many images we enhanced.
      let newProductId: string | undefined;
      if (mode === "new") {
        const src = product as Awaited<ReturnType<typeof prisma.product.findFirst>>;
        if (!src) throw new Error("Source product not found for clone");
        const existingTags = Array.isArray(src.tags) ? (src.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
        const tagsWithAi = existingTags.includes("ai-enhanced") ? existingTags : [...existingTags, "ai-enhanced"];
        const created = await prisma.product.create({
          data: {
            userId: req.auth!.userId,
            // Title stays verbatim — provenance via the ai-enhanced tag.
            title: src.title,
            description: src.description,
            price: src.price,
            compareAtPrice: src.compareAtPrice,
            // sku, marketplace linkage, and platform IDs must NOT be copied —
            // (sku+userId) is unique and duplicating a platformProductId would
            // make Shopify/Salla think two rows are the same product.
            sku: null,
            barcode: null,
            currency: src.currency,
            quantity: src.quantity,
            // Per Ashhad's product spec: 1 source product = 1 new draft,
            // containing ALL the enhanced versions (not 1 draft per image).
            images: enhancedUrls as unknown as Prisma.InputJsonValue,
            category: src.category,
            productType: src.productType,
            vendor: src.vendor,
            tags: tagsWithAi as unknown as Prisma.InputJsonValue,
            weight: src.weight,
            weightUnit: src.weightUnit,
            status: "DRAFT",
          },
          select: { id: true },
        });
        newProductId = created.id;
      } else {
        // prepend (default) or overwrite — update in place
        const nextImages = mode === "overwrite" ? enhancedUrls : [...enhancedUrls, ...productImages];
        await prisma.product.update({
          where: { id: product.id },
          data: { images: nextImages },
        });
      }

      succeeded.push({
        productId: product.id,
        // Surface the FIRST enhanced URL as the primary preview. The full
        // list lives on the product itself.
        enhancedImageUrl: lastSavedImagePath
          ? signMediaPath(lastSavedImagePath, MEDIA_TTL_SHORT)
          : enhancedUrls[0],
        ...(newProductId ? { newProductId } : {}),
      });
    };

    // Dispatch with a concurrency cap. Each worker pulls the next id until
    // the queue is empty. If credits run out, remaining ids get marked failed.
    const queue = [...ids];
    let creditsExhausted = false;
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        if (creditsExhausted) {
          const id = queue.shift()!;
          failed.push({ productId: id, error: "Credits exhausted" });
          continue;
        }
        const id = queue.shift()!;
        try {
          await enhanceOne(id);
        } catch (err) {
          // Swallow everything — enhanceOne is supposed to push to failed[]
          // on its own, but anything it lets escape (DB error, unexpected
          // exception) must NOT kill the other workers.
          if (err instanceof AICreditError) creditsExhausted = true;
          console.error(`[bulk-enhance] worker caught unexpected error for product ${id}:`, err);
          // Make sure we at least recorded a failure for this id
          if (!succeeded.some((s) => s.productId === id) && !failed.some((f) => f.productId === id)) {
            failed.push({ productId: id, error: "Unexpected error" });
          }
        }
      }
    };
    const workers = Array.from({ length: Math.min(BULK_ENHANCE_CONCURRENCY, ids.length) }, () => worker());
    await Promise.all(workers);

    // If we never managed to call enhanceOne successfully, we don't have a
    // fresh credit count — read it back cheaply.
    if (lastRemainingCredits === null) {
      const user = await prisma.user.findUnique({
        where: { id: req.auth!.userId },
        select: { aiCredits: true, purchasedCredits: true },
      });
      lastRemainingCredits = (user?.aiCredits ?? 0) + (user?.purchasedCredits ?? 0);
    }

    res.json({
      succeeded,
      failed,
      remainingCredits: lastRemainingCredits,
      total: ids.length,
      scene,
      mode,
    });
  } catch (err) {
    console.error("Bulk enhance error:", err);
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
