import { PrismaClient, MarketplaceConnection } from "@prisma/client";
import { encrypt, decrypt } from "../lib/crypto";

// --- Types ---

export interface ShopifyVariant {
  id?: number;
  price: string;
  compare_at_price?: string | null;
  sku?: string | null;
  barcode?: string | null;
  inventory_quantity?: number;
  weight?: number;
  weight_unit?: string;
  inventory_management?: "shopify" | null;
  inventory_policy?: "deny" | "continue";
}

export interface ShopifyImage {
  id?: number;
  src: string;
  position?: number;
}

export interface ShopifyProductPayload {
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  status?: "active" | "draft" | "archived";
  variants: ShopifyVariant[];
  images?: ShopifyImage[];
}

export interface ShopifyProduct extends ShopifyProductPayload {
  id: number;
  created_at: string;
  updated_at: string;
  variants: (ShopifyVariant & { id: number })[];
  images: (ShopifyImage & { id: number })[];
}

export interface ShopifyProductsPage {
  products: ShopifyProduct[];
  nextPageInfo?: string;
}

// --- Errors ---

export class ShopifyAuthError extends Error {
  code = "SHOPIFY_AUTH_ERROR";
  constructor(message = "Invalid Shopify credentials") {
    super(message);
  }
}

export class ShopifyApiError extends Error {
  code = "SHOPIFY_API_ERROR";
  status: number;
  shopifyErrors?: unknown;
  constructor(status: number, message: string, errors?: unknown) {
    super(message);
    this.status = status;
    this.shopifyErrors = errors;
  }
}

// --- Service ---

export class ShopifyService {
  private connection: MarketplaceConnection;
  private prisma: PrismaClient;

  constructor(connection: MarketplaceConnection, prisma: PrismaClient) {
    this.connection = connection;
    this.prisma = prisma;
  }

  private get baseUrl(): string {
    let host = this.connection.storeUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${host}/admin/api/2025-01`;
  }

  async getValidToken(): Promise<string> {
    // Re-read from DB in case another request already refreshed
    const fresh = await this.prisma.marketplaceConnection.findUnique({
      where: { id: this.connection.id },
    });
    if (fresh) this.connection = fresh;

    const expiresAt = this.connection.tokenExpiresAt;
    const bufferMs = 5 * 60 * 1000; // 5 minute buffer

    if (!expiresAt || expiresAt.getTime() - bufferMs <= Date.now()) {
      return this.refreshToken();
    }

    try {
      return decrypt(this.connection.accessToken);
    } catch {
      // If decryption fails (legacy plaintext token), try refresh
      return this.refreshToken();
    }
  }

  async refreshToken(): Promise<string> {
    if (!this.connection.clientId || !this.connection.clientSecret) {
      throw new ShopifyAuthError("Missing Shopify client credentials");
    }

    const clientSecret = decrypt(this.connection.clientSecret);
    let host = this.connection.storeUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");

    const res = await fetch(`https://${host}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.connection.clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new ShopifyAuthError(`Token exchange failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number; scope: string };
    const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

    this.connection = await this.prisma.marketplaceConnection.update({
      where: { id: this.connection.id },
      data: {
        accessToken: encrypt(data.access_token),
        tokenExpiresAt,
      },
    });

    return data.access_token;
  }

  private async shopifyFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getValidToken();

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    // Rate limit check
    const limitHeader = res.headers.get("X-Shopify-Shop-Api-Call-Limit");
    if (limitHeader) {
      const [used] = limitHeader.split("/").map(Number);
      if (used >= 38) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Handle 429 rate limit
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2");
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.shopifyFetch(path, options); // retry once
    }

    // Handle 401
    if (res.status === 401) {
      throw new ShopifyAuthError("Shopify rejected the access token");
    }

    // Handle other errors
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ShopifyApiError(res.status, `Shopify API error: ${res.status}`, body);
    }

    return res;
  }

  async fetchProducts(limit = 250, pageInfo?: string): Promise<ShopifyProductsPage> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (pageInfo) params.set("page_info", pageInfo);

    const res = await this.shopifyFetch(`/products.json?${params}`);
    const data = (await res.json()) as { products: ShopifyProduct[] };

    // Parse Link header for next page
    let nextPageInfo: string | undefined;
    const linkHeader = res.headers.get("Link");
    if (linkHeader) {
      const nextMatch = linkHeader.match(/page_info=([^&>]+).*?rel="next"/);
      if (nextMatch) nextPageInfo = nextMatch[1];
    }

    return { products: data.products, nextPageInfo };
  }

  async createProduct(payload: ShopifyProductPayload): Promise<ShopifyProduct> {
    const res = await this.shopifyFetch("/products.json", {
      method: "POST",
      body: JSON.stringify({ product: payload }),
    });
    const data = (await res.json()) as { product: ShopifyProduct };
    return data.product;
  }

  async updateProduct(shopifyId: string, payload: Partial<ShopifyProductPayload>): Promise<ShopifyProduct> {
    const res = await this.shopifyFetch(`/products/${shopifyId}.json`, {
      method: "PUT",
      body: JSON.stringify({ product: payload }),
    });
    const data = (await res.json()) as { product: ShopifyProduct };
    return data.product;
  }
}
