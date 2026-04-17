import crypto from "crypto";

/**
 * HMAC-signed URLs for the /media/* static server.
 *
 * Every /media/* request must carry ?sig=<ms_expiry>.<hex_hmac>. The static
 * handler in index.ts verifies the signature before serving the file. This
 * prevents stranger access + mass UUID enumeration of stored images.
 *
 * Callers pick a TTL based on use:
 *   - gallery thumbnails / previews: 1h (renewed on each page load)
 *   - marketplace push: 7d (needs to be fetchable by Shopify/Salla servers)
 */

function getSigningKey(): string {
  return process.env.MEDIA_SIGNING_KEY || process.env.JWT_SECRET!;
}

export const MEDIA_TTL_SHORT = 60 * 60 * 1000;           // 1 hour
export const MEDIA_TTL_MARKETPLACE = 7 * 24 * 60 * 60 * 1000; // 7 days

export function signMediaPath(relPath: string, ttlMs: number = MEDIA_TTL_SHORT): string {
  const pathname = `/media/${relPath}`.replace(/\/+/g, "/");
  const expiry = Date.now() + ttlMs;
  const hmac = crypto
    .createHmac("sha256", getSigningKey())
    .update(`${pathname}|${expiry}`)
    .digest("hex");
  return `${pathname}?sig=${expiry}.${hmac}`;
}

export function verifyMediaSig(pathname: string, sig: string): boolean {
  const dot = sig.indexOf(".");
  if (dot < 0) return false;
  const expiryStr = sig.slice(0, dot);
  const providedHex = sig.slice(dot + 1);
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = crypto
    .createHmac("sha256", getSigningKey())
    .update(`${pathname}|${expiryStr}`)
    .digest("hex");
  const a = Buffer.from(providedHex, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
