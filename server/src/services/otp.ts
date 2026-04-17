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
 * Send a 6-digit OTP to the merchant's email via SMTP (nodemailer).
 *
 * If SMTP isn't configured, throws — the caller surfaces a clean error to the
 * user rather than silently logging the OTP (which would leak it via PM2 logs).
 * Set `WHATSAPP_OTP_DEBUG=true` in a non-prod env to bypass SMTP and log the
 * code instead (local dev only).
 */
import { sendMail } from "./mail";

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  if (process.env.WHATSAPP_OTP_DEBUG === "true" && process.env.NODE_ENV !== "production") {
    console.log(`[OTP-DEBUG] code for ${email}: ${otp} (expires in ${OTP_TTL_MINUTES} min)`);
    return;
  }
  await sendMail({
    to: email,
    subject: `Your TijarFlow verification code: ${otp}`,
    text: `Your TijarFlow verification code is: ${otp}\n\nThis code will expire in ${OTP_TTL_MINUTES} minutes.\n\nIf you didn't request this code, you can safely ignore this email.\n\n— TijarFlow`,
    html: `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:40px auto;padding:32px;background:#f8fafc;border-radius:12px;">
  <h2 style="color:#0f172a;margin:0 0 16px">TijarFlow verification code</h2>
  <p style="color:#475569;font-size:15px;line-height:1.5;margin:0 0 24px">Enter this 6-digit code in WhatsApp to link your account:</p>
  <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#0d9488;background:#ffffff;padding:20px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;margin-bottom:24px">${otp}</div>
  <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0">This code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, you can safely ignore this email.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0"/>
  <p style="color:#94a3b8;font-size:12px;margin:0">TijarFlow — AI-powered product photography</p>
</body></html>`,
  });
}
