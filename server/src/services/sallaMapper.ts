import type { Prisma } from "@prisma/client";
import type { SallaProduct, SallaProductPayload } from "./salla";

// ── Status mappings ───────────────────────────────────────────────────────────

const statusToTijarflow: Record<string, "ACTIVE" | "DRAFT" | "ARCHIVED"> = {
  sale:   "ACTIVE",
  hidden: "DRAFT",
  out:    "DRAFT",
};

const statusToSalla: Record<string, "sale" | "hidden"> = {
  ACTIVE:   "sale",
  DRAFT:    "hidden",
  ARCHIVED: "hidden",
};

// ── Salla → Tijarflow ─────────────────────────────────────────────────────────

export function sallaProductToTijarflow(
  sp: SallaProduct,
  connectionId: string,
  userId: string,
): Prisma.ProductUncheckedCreateInput {
  const images   = sp.images?.map((img) => img.url) ?? [];
  const category = sp.categories?.[0]?.name ?? null;
  const currency = sp.price?.currency ?? "SAR";

  // Salla description may contain HTML — strip tags
  const description = sp.description
    ? sp.description.replace(/<[^>]+>/g, "").trim() || null
    : null;

  return {
    userId,
    marketplaceConnectionId: connectionId,
    title:          sp.name,
    description,
    price:          sp.price?.amount ?? 0,
    compareAtPrice: sp.sale_price?.amount ?? null,
    sku:            sp.sku || null,
    barcode:        null,
    currency,
    quantity:       sp.quantity ?? 0,
    weight:         null,
    weightUnit:     "kg",
    images,
    tags:           [],
    productType:    null,
    vendor:         null,
    category,
    status:         statusToTijarflow[sp.status] ?? "DRAFT",
    platformProductId: String(sp.id),
    platformData:   sp as unknown as Prisma.JsonObject,
  };
}

// ── Tijarflow → Salla ─────────────────────────────────────────────────────────

export function tijarflowProductToSalla(product: {
  title:          string;
  description?:   string | null;
  price:          unknown;
  compareAtPrice?: unknown;
  sku?:           string | null;
  quantity:       number;
  images?:        unknown;
  status:         string;
  currency?:      string | null;
}): SallaProductPayload {
  const currency = product.currency ?? "SAR";
  const images   = Array.isArray(product.images)
    ? (product.images as string[])
        .filter((url) => url.startsWith("http"))
        .map((url) => ({ url }))
    : [];

  return {
    name:        product.title,
    description: product.description ?? undefined,
    price: {
      amount:   Number(product.price),
      currency,
    },
    sale_price: product.compareAtPrice
      ? { amount: Number(product.compareAtPrice), currency }
      : null,
    sku:      product.sku ?? undefined,
    quantity: product.quantity,
    status:   statusToSalla[product.status] ?? "hidden",
    images,
  };
}
