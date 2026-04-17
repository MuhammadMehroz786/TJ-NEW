import crypto from "crypto";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export function verifyOtp(input: string, hash: string): boolean {
  const inputHash = hashOtp(input);
  const a = Buffer.from(inputHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Send a 6-digit OTP to the merchant's email.
 *
 * Currently a stub — until SMTP is wired up (SendGrid / Resend / SES), we
 * cannot deliver OTPs. We deliberately refuse to log the code to stdout because
 * PM2 logs are readable on the VPS and that leaks every merchant's one-time
 * code. When an SMTP provider is configured, replace this body with a real
 * send; until then, the caller will get an error and the user sees a config
 * error instead of a silent-steal of their OTP.
 *
 * Set `WHATSAPP_OTP_DEBUG=true` in a non-prod env if you explicitly want logs.
 */
export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  if (process.env.WHATSAPP_OTP_DEBUG === "true" && process.env.NODE_ENV !== "production") {
    console.log(`[OTP-DEBUG] code for ${email}: ${otp} (expires in ${OTP_TTL_MINUTES} min)`);
    return;
  }
  throw new Error("OTP email delivery is not configured — set up SMTP before enabling merchant verification");
}
