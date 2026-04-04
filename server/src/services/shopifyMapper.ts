import type { Prisma } from "@prisma/client";
import type { ShopifyProduct, ShopifyProductPayload } from "./shopify";

const statusToTijarflow: Record<string, "ACTIVE" | "DRAFT" | "ARCHIVED"> = {
  active: "ACTIVE",
  draft: "DRAFT",
  archived: "ARCHIVED",
};

const statusToShopify: Record<string, "active" | "draft" | "archived"> = {
  ACTIVE: "active",
  DRAFT: "draft",
  ARCHIVED: "archived",
};

export function shopifyProductToTijarflow(
  sp: ShopifyProduct,
  connectionId: string,
  userId: string,
  currency = "USD",
): Prisma.ProductUncheckedCreateInput {
  const variant = sp.variants?.[0];

  return {
    userId,
    marketplaceConnectionId: connectionId,
    title: sp.title,
    description: sp.body_html ? sp.body_html.replace(/<[^>]+>/g, "") : null,
    price: variant?.price ? Number(variant.price) : 0,
    compareAtPrice: variant?.compare_at_price ? Number(variant.compare_at_price) : null,
    sku: variant?.sku || null,
    barcode: variant?.barcode || null,
    currency,
    quantity: variant?.inventory_quantity ?? 0,
    weight: variant?.weight ? Number(variant.weight) : null,
    weightUnit: variant?.weight_unit || "kg",
    images: sp.images?.map((img) => img.src) || [],
    tags: sp.tags ? sp.tags.split(", ").filter(Boolean) : [],
    productType: sp.product_type || null,
    vendor: sp.vendor || null,
    category: null,
    status: statusToTijarflow[sp.status || "draft"] || "DRAFT",
    platformProductId: String(sp.id),
    platformData: sp as unknown as Prisma.JsonObject,
  };
}

export function tijarflowProductToShopify(
  product: {
    title: string;
    description?: string | null;
    price: unknown;
    compareAtPrice?: unknown;
    sku?: string | null;
    barcode?: string | null;
    quantity: number;
    weight?: unknown;
    weightUnit?: string | null;
    images?: unknown;
    tags?: unknown;
    productType?: string | null;
    vendor?: string | null;
    status: string;
  },
): ShopifyProductPayload {
  const images = Array.isArray(product.images)
    ? (product.images as string[])
        .filter((src) => src.startsWith("http"))
        .map((src, i) => ({ src, position: i + 1 }))
    : [];

  const tags = Array.isArray(product.tags) ? (product.tags as string[]).join(", ") : "";

  return {
    title: product.title,
    body_html: product.description || "",
    vendor: product.vendor || undefined,
    product_type: product.productType || undefined,
    tags,
    status: statusToShopify[product.status] || "draft",
    variants: [
      {
        price: String(Number(product.price)),
        compare_at_price: product.compareAtPrice ? String(Number(product.compareAtPrice)) : null,
        sku: product.sku || undefined,
        barcode: product.barcode || undefined,
        inventory_quantity: product.quantity,
        weight: product.weight ? Number(product.weight) : undefined,
        weight_unit: product.weightUnit || "kg",
        inventory_management: "shopify",
        inventory_policy: "deny",
      },
    ],
    images,
  };
}
