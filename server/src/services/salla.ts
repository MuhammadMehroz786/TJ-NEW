import { PrismaClient, MarketplaceConnection } from "@prisma/client";
import { encrypt, decrypt } from "../lib/crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SallaPrice {
  amount: number;
  currency: string;
}

export interface SallaImage {
  url: string;
  alt?: string;
}

export interface SallaCategory {
  id: number;
  name: string;
}

export interface SallaProduct {
  id: number;
  name: string;
  description?: string | null;
  price: SallaPrice;
  sale_price?: SallaPrice | null;
  status: "sale" | "hidden" | "out";
  sku?: string | null;
  quantity: number;
  images: SallaImage[];
  categories?: SallaCategory[];
  metadata?: {
    title?: string;
    description?: string;
  };
}

export interface SallaProductPayload {
  name: string;
  description?: string;
  price: { amount: number; currency: string };
  sale_price?: { amount: number; currency: string } | null;
  status: "sale" | "hidden";
  sku?: string;
  quantity?: number;
  images?: { url: string }[];
}

export interface SallaProductsPage {
  products: SallaProduct[];
  nextCursor?: string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class SallaAuthError extends Error {
  code = "SALLA_AUTH_ERROR";
  constructor(message = "Invalid Salla credentials") {
    super(message);
    this.name = "SallaAuthError";
  }
}

export class SallaApiError extends Error {
  code = "SALLA_API_ERROR";
  status: number;
  sallaErrors?: unknown;
  constructor(status: number, message: string, errors?: unknown) {
    super(message);
    this.name = "SallaApiError";
    this.status = status;
    this.sallaErrors = errors;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SALLA_TOKEN_URL = "https://accounts.salla.sa/oauth2/token";
const SALLA_API_BASE  = "https://api.salla.dev/admin/v2";

// ── Service (per-connection instance) ────────────────────────────────────────

export class SallaService {
  private connection: MarketplaceConnection;
  private prisma: PrismaClient;

  constructor(connection: MarketplaceConnection, prisma: PrismaClient) {
    this.connection = connection;
    this.prisma = prisma;
  }

  async getValidToken(): Promise<string> {
    // Re-read from DB in case another request already refreshed
    const fresh = await this.prisma.marketplaceConnection.findUnique({
      where: { id: this.connection.id },
    });
    if (fresh) this.connection = fresh;

    const expiresAt = this.connection.tokenExpiresAt;
    const bufferMs  = 5 * 60 * 1000; // 5-minute buffer

    if (!expiresAt || expiresAt.getTime() - bufferMs <= Date.now()) {
      return this.refreshToken();
    }

    try {
      return decrypt(this.connection.accessToken);
    } catch {
      // Decryption failed (legacy plaintext) — try refresh
      return this.refreshToken();
    }
  }

  async refreshToken(): Promise<string> {
    // Use the merchant's own client credentials (stored per-connection) to get a fresh token
    const clientId     = this.connection.clientId;
    const clientSecret = this.connection.clientSecret ? decrypt(this.connection.clientSecret) : null;

    if (!clientId || !clientSecret) {
      throw new SallaAuthError("No client credentials stored — re-connect the store");
    }

    const res = await fetch(SALLA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "client_credentials",
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         "offline_access products.read products.write",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new SallaAuthError(`Token refresh failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number; token_type: string };
    const tokenExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

    await this.prisma.marketplaceConnection.update({
      where: { id: this.connection.id },
      data: { accessToken: encrypt(data.access_token), tokenExpiresAt },
    });

    this.connection.accessToken    = encrypt(data.access_token);
    this.connection.tokenExpiresAt = tokenExpiresAt;

    return data.access_token;
  }

  private async sallaFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getValidToken();

    const res = await fetch(`${SALLA_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept:         "application/json",
        ...(options.headers || {}),
      },
    });

    // Handle 429 rate limit
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2");
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.sallaFetch(path, options);
    }

    // Handle 401 — token rejected
    if (res.status === 401) {
      throw new SallaAuthError("Salla rejected the access token — re-authorize");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new SallaApiError(res.status, `Salla API error: ${res.status}`, body);
    }

    return res;
  }

  async fetchProducts(cursor?: string): Promise<SallaProductsPage> {
    const params = new URLSearchParams({ per_page: "50" });
    if (cursor) params.set("page", cursor);

    const res  = await this.sallaFetch(`/products?${params}`);
    const body = (await res.json()) as {
      data:   SallaProduct[];
      cursor: { next?: string } | null;
    };

    return {
      products:   body.data ?? [],
      nextCursor: body.cursor?.next ?? undefined,
    };
  }

  async createProduct(payload: SallaProductPayload): Promise<SallaProduct> {
    const res  = await this.sallaFetch("/products", {
      method: "POST",
      body:   JSON.stringify(payload),
    });
    const body = (await res.json()) as { data: SallaProduct };
    return body.data;
  }

  async updateProduct(sallaId: string, payload: Partial<SallaProductPayload>): Promise<SallaProduct> {
    const res  = await this.sallaFetch(`/products/${sallaId}`, {
      method: "PUT",
      body:   JSON.stringify(payload),
    });
    const body = (await res.json()) as { data: SallaProduct };
    return body.data;
  }
}
