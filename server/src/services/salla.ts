import { PrismaClient, MarketplaceConnection } from "@prisma/client";
import { encrypt, decrypt } from "../lib/crypto";

// Prisma client not yet regenerated after adding refreshToken column — extend locally
type SallaConnection = MarketplaceConnection & { refreshToken?: string | null };

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

export interface SallaTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
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

// ── OAuth Helpers (static — no connection needed) ────────────────────────────

const SALLA_TOKEN_URL = "https://accounts.salla.sa/oauth2/token";
const SALLA_AUTH_URL  = "https://accounts.salla.sa/oauth2/auth";
const SALLA_API_BASE  = "https://api.salla.dev/admin/v2";

export function getSallaAuthUrl(state: string): string {
  const clientId    = process.env.SALLA_CLIENT_ID!;
  const redirectUri = process.env.SALLA_REDIRECT_URI!;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "offline_access products.read products.write",
    state,
  });

  return `${SALLA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeSallaCode(code: string): Promise<SallaTokenResponse> {
  const clientId     = process.env.SALLA_CLIENT_ID!;
  const clientSecret = process.env.SALLA_CLIENT_SECRET!;
  const redirectUri  = process.env.SALLA_REDIRECT_URI!;

  const res = await fetch(SALLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new SallaAuthError(`Code exchange failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<SallaTokenResponse>;
}

// ── Service (per-connection instance) ────────────────────────────────────────

export class SallaService {
  private connection: SallaConnection;
  private prisma: PrismaClient;

  constructor(connection: MarketplaceConnection, prisma: PrismaClient) {
    this.connection = connection as SallaConnection;
    this.prisma = prisma;
  }

  async getValidToken(): Promise<string> {
    // Re-read from DB in case another request already refreshed
    const fresh = await this.prisma.marketplaceConnection.findUnique({
      where: { id: this.connection.id },
    });
    if (fresh) this.connection = fresh as SallaConnection;

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
    const storedRefresh = this.connection.refreshToken;
    if (!storedRefresh) {
      throw new SallaAuthError("No refresh token stored — re-authorize the store");
    }

    const refreshTokenPlain = decrypt(storedRefresh);
    const clientId          = process.env.SALLA_CLIENT_ID!;
    const clientSecret      = process.env.SALLA_CLIENT_SECRET!;

    const res = await fetch(SALLA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: refreshTokenPlain,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new SallaAuthError(`Token refresh failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as SallaTokenResponse;
    const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

    // Persist updated tokens — use raw query because refreshToken column may not
    // be in generated Prisma client yet (run `prisma generate` after server restart)
    await this.prisma.$executeRawUnsafe(
      `UPDATE "MarketplaceConnection"
       SET "accessToken" = $1, "refreshToken" = $2, "tokenExpiresAt" = $3, "updatedAt" = NOW()
       WHERE id = $4`,
      encrypt(data.access_token),
      encrypt(data.refresh_token),
      tokenExpiresAt,
      this.connection.id,
    );

    this.connection.accessToken    = encrypt(data.access_token);
    this.connection.refreshToken   = encrypt(data.refresh_token);
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
