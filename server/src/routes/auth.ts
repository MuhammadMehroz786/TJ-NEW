import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { generateOtp, hashOtp, verifyOtp, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS } from "../services/otp";
import { sendMail } from "../services/mail";

const router = Router();
const prisma = new PrismaClient();

function generateToken(userId: string, email: string, role: string): string {
  return jwt.sign({ userId, email, role }, process.env.JWT_SECRET!, { expiresIn: "7d" });
}

async function sendSignupOtpEmail(email: string, name: string, otp: string): Promise<void> {
  await sendMail({
    to: email,
    subject: `Your TijarFlow sign-up code: ${otp}`,
    text: `Hi ${name},\n\nYour TijarFlow sign-up verification code is: ${otp}\n\nThis code will expire in ${OTP_TTL_MINUTES} minutes. If you didn't create an account, you can safely ignore this email.\n\n— TijarFlow`,
    html: `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:40px auto;padding:32px;background:#f8fafc;border-radius:12px;">
  <h2 style="color:#0f172a;margin:0 0 16px">Welcome to TijarFlow, ${name}!</h2>
  <p style="color:#475569;font-size:15px;line-height:1.5;margin:0 0 24px">Enter this 6-digit code to finish creating your account:</p>
  <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#0d9488;background:#ffffff;padding:20px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;margin-bottom:24px">${otp}</div>
  <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0">Expires in ${OTP_TTL_MINUTES} minutes. If you didn't sign up, you can safely ignore this email.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0"/>
  <p style="color:#94a3b8;font-size:12px;margin:0">TijarFlow — AI-powered product photography</p>
</body></html>`,
  });
}

// POST /api/auth/signup — start sign-up flow: park credentials, email OTP
router.post("/signup", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email: rawEmail, password, name, role } = req.body;

    if (!rawEmail || !password || !name) {
      res.status(400).json({ error: "Email, password, and name are required", code: "VALIDATION_ERROR" });
      return;
    }
    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters", code: "VALIDATION_ERROR" });
      return;
    }
    // MVP scope: only MERCHANT signups are accepted. Reject creator signup
    // attempts even if someone posts directly to the API — the frontend
    // picker has been removed but the DB model still supports the role for
    // existing accounts and future re-enable.
    if (role && role !== "MERCHANT") {
      res.status(400).json({ error: "Creator signups aren't available yet. Please sign up as a Merchant.", code: "CREATOR_SIGNUP_DISABLED" });
      return;
    }
    const email = String(rawEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Please provide a valid email address", code: "VALIDATION_ERROR" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already in use", code: "CONFLICT" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    try {
      await sendSignupOtpEmail(email, String(name).slice(0, 80), otp);
    } catch (err) {
      console.error("[signup] OTP email send failed:", (err as Error)?.message || err);
      res.status(503).json({ error: "Couldn't send the verification email. Please try again in a minute.", code: "EMAIL_SEND_FAILED" });
      return;
    }

    // Upsert so re-submits resend a fresh code without leaking that the email existed
    await prisma.pendingSignup.upsert({
      where: { email },
      create: { email, passwordHash, name: String(name).trim().slice(0, 80), role: role || "MERCHANT", otpHash, otpExpiresAt, attempts: 0 },
      update: { passwordHash, name: String(name).trim().slice(0, 80), role: role || "MERCHANT", otpHash, otpExpiresAt, attempts: 0 },
    });

    res.status(202).json({
      pending: true,
      email,
      message: `A 6-digit verification code has been sent to ${email}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    });
  } catch (err) {
    console.error("[signup] error:", (err as Error)?.message || err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/auth/signup/verify — complete sign-up: validate OTP, create user, issue JWT
router.post("/signup/verify", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email: rawEmail, code } = req.body;
    if (!rawEmail || !code) {
      res.status(400).json({ error: "Email and code are required", code: "VALIDATION_ERROR" });
      return;
    }
    const email = String(rawEmail).trim().toLowerCase();
    const digits = String(code).trim().replace(/\D/g, "");
    if (digits.length !== 6) {
      res.status(400).json({ error: "Code must be 6 digits", code: "VALIDATION_ERROR" });
      return;
    }

    const pending = await prisma.pendingSignup.findUnique({ where: { email } });
    if (!pending) {
      res.status(404).json({ error: "No pending sign-up for this email. Start over.", code: "NOT_FOUND" });
      return;
    }
    if (pending.otpExpiresAt.getTime() < Date.now()) {
      await prisma.pendingSignup.delete({ where: { email } }).catch(() => {});
      res.status(410).json({ error: "That code has expired. Please sign up again.", code: "OTP_EXPIRED" });
      return;
    }
    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.pendingSignup.delete({ where: { email } }).catch(() => {});
      res.status(429).json({ error: "Too many incorrect attempts. Please sign up again.", code: "OTP_LOCKED" });
      return;
    }
    if (!verifyOtp(digits, pending.otpHash)) {
      const updated = await prisma.pendingSignup.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      const left = Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts);
      res.status(400).json({ error: `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.`, code: "OTP_INVALID" });
      return;
    }

    // Guard against a race where someone signed up the same email via another path
    const already = await prisma.user.findUnique({ where: { email } });
    if (already) {
      await prisma.pendingSignup.delete({ where: { email } }).catch(() => {});
      res.status(409).json({ error: "Email already in use", code: "CONFLICT" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: pending.passwordHash,
        name: pending.name,
        role: pending.role,
      },
    });
    await prisma.pendingSignup.delete({ where: { email } }).catch(() => {});

    const token = generateToken(user.id, user.email, user.role);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, language: user.language, createdAt: user.createdAt, updatedAt: user.updatedAt },
    });
  } catch (err) {
    console.error("[signup/verify] error:", (err as Error)?.message || err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/auth/signup/resend — regenerate + resend the OTP if user lost it
router.post("/signup/resend", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: "Email is required", code: "VALIDATION_ERROR" });
      return;
    }
    const pending = await prisma.pendingSignup.findUnique({ where: { email } });
    if (!pending) {
      // Respond like success to avoid enumeration
      res.json({ message: "If a sign-up is pending for that email, a new code has been sent." });
      return;
    }
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    try {
      await sendSignupOtpEmail(email, pending.name, otp);
    } catch (err) {
      console.error("[signup/resend] OTP email send failed:", (err as Error)?.message || err);
      res.status(503).json({ error: "Couldn't send the email. Try again shortly.", code: "EMAIL_SEND_FAILED" });
      return;
    }
    await prisma.pendingSignup.update({
      where: { email },
      data: { otpHash, otpExpiresAt, attempts: 0 },
    });
    res.json({ message: "If a sign-up is pending for that email, a new code has been sent." });
  } catch (err) {
    console.error("[signup/resend] error:", (err as Error)?.message || err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required", code: "VALIDATION_ERROR" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password", code: "UNAUTHORIZED" });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(401).json({ error: "Invalid email or password", code: "UNAUTHORIZED" });
      return;
    }

    // Admins cannot log in with a password — passwordless magic-code only.
    // Block here and point them at /admin-login.
    if (user.role === "ADMIN") {
      res.status(403).json({
        error: "Admin accounts use passwordless login. Please use /admin-login instead.",
        code: "ADMIN_PASSWORDLESS_ONLY",
      });
      return;
    }

    const token = generateToken(user.id, user.email, user.role);

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, language: user.language, createdAt: user.createdAt, updatedAt: user.updatedAt },
    });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// ── Admin passwordless login ──────────────────────────────────────────────────
//
// Admins never use passwords — only short-lived email codes. Two endpoints:
//   POST /api/auth/admin/request-code  { email }        → emails a 6-digit code
//   POST /api/auth/admin/verify-code   { email, code }  → issues JWT
//
// Security properties:
// • Code rows are upserted per email, so a second request invalidates the first
// • Generic success response on request-code regardless of whether the email
//   belongs to an admin (no enumeration)
// • Code is hashed with SHA-256 in DB; compared in constant time
// • 10-min TTL, 5 max attempts, then row deleted
// • Only ADMIN users can obtain a token via this path (non-admin email → generic
//   "if an admin account exists, a code has been sent" + no code actually sent)
async function sendAdminLoginEmail(email: string, code: string): Promise<void> {
  await sendMail({
    to: email,
    subject: `Your TijarFlow admin sign-in code: ${code}`,
    text: `Your admin sign-in code is: ${code}\n\nThis code will expire in ${OTP_TTL_MINUTES} minutes. If you requested multiple codes, only the most recent one will work. If you didn't request any code, someone is trying to access the admin portal — rotate your credentials immediately.\n\n— TijarFlow`,
    html: `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:40px auto;padding:32px;background:#f8fafc;border-radius:12px;">
  <h2 style="color:#0f172a;margin:0 0 8px">Admin sign-in code</h2>
  <p style="color:#475569;font-size:15px;line-height:1.5;margin:0 0 24px">Enter this 6-digit code to access the TijarFlow admin portal:</p>
  <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#7c3aed;background:#ffffff;padding:20px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;margin-bottom:24px">${code}</div>
  <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0">Expires in ${OTP_TTL_MINUTES} minutes. If you requested multiple codes, only the most recent one will work. If you didn't request any, someone is trying to access the admin portal — rotate your credentials immediately.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0"/>
  <p style="color:#94a3b8;font-size:12px;margin:0">TijarFlow — Admin access</p>
</body></html>`,
  });
}

// POST /api/auth/admin/request-code — email a 6-digit login code to an admin
router.post("/admin/request-code", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Same generic message regardless — avoid revealing whether the email exists
      res.json({ message: "If an admin account exists for that email, a sign-in code has been sent." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user || user.role !== "ADMIN") {
      // Generic response — no enumeration
      res.json({ message: "If an admin account exists for that email, a sign-in code has been sent." });
      return;
    }

    const code = generateOtp();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    const requestedIp = (req.headers["x-forwarded-for"] as string || req.ip || "").split(",")[0].trim() || null;

    try {
      await sendAdminLoginEmail(email, code);
    } catch (err) {
      console.error("[admin-login] email send failed:", (err as Error)?.message || err);
      res.status(503).json({ error: "Couldn't send the email. Try again shortly.", code: "EMAIL_SEND_FAILED" });
      return;
    }

    await prisma.adminLoginCode.upsert({
      where: { email },
      create: { email, codeHash, expiresAt, attempts: 0, requestedIp },
      update: { codeHash, expiresAt, attempts: 0, requestedIp },
    });

    console.log(`[admin-login] code sent to ${email} (ip=${requestedIp})`);
    res.json({ message: "If an admin account exists for that email, a sign-in code has been sent." });
  } catch (err) {
    console.error("[admin-login] request-code error:", (err as Error)?.message || err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// POST /api/auth/admin/verify-code — validate code, return JWT
router.post("/admin/verify-code", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim().replace(/\D/g, "");
    if (!email || code.length !== 6) {
      res.status(400).json({ error: "Email and 6-digit code are required", code: "VALIDATION_ERROR" });
      return;
    }

    const row = await prisma.adminLoginCode.findUnique({ where: { email } });
    if (!row) {
      res.status(404).json({ error: "No code was requested for that email. Request one first.", code: "NOT_FOUND" });
      return;
    }
    if (row.expiresAt.getTime() < Date.now()) {
      await prisma.adminLoginCode.delete({ where: { email } }).catch(() => {});
      res.status(410).json({ error: "That code has expired. Request a new one.", code: "OTP_EXPIRED" });
      return;
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.adminLoginCode.delete({ where: { email } }).catch(() => {});
      res.status(429).json({ error: "Too many incorrect attempts. Request a new code.", code: "OTP_LOCKED" });
      return;
    }
    if (!verifyOtp(code, row.codeHash)) {
      const updated = await prisma.adminLoginCode.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      const left = Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts);
      res.status(400).json({ error: `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.`, code: "OTP_INVALID" });
      return;
    }

    // Double-check the user still has ADMIN role (belt-and-suspenders)
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, language: true, createdAt: true, updatedAt: true },
    });
    if (!user || user.role !== "ADMIN") {
      await prisma.adminLoginCode.delete({ where: { email } }).catch(() => {});
      res.status(403).json({ error: "Account is no longer an admin.", code: "FORBIDDEN" });
      return;
    }

    await prisma.adminLoginCode.delete({ where: { email } }).catch(() => {});
    console.log(`[admin-login] ${email} signed in`);

    const token = generateToken(user.id, user.email, user.role);
    res.json({ token, user });
  } catch (err) {
    console.error("[admin-login] verify-code error:", (err as Error)?.message || err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// ── Password Reset ──────────────────────────────────────────────────────────
// Flow:
//  1. POST /forgot-password  → any request returns 200 with a generic message
//     (don't leak whether the email exists). If the email is real and not an
//     ADMIN account, generate a 32-byte token, store its sha256, email the
//     plain token in a link to the app's /reset-password page.
//  2. POST /reset-password   → verify token hash in constant time, check
//     expiry + unused, update bcrypt hash, mark token used.
const PASSWORD_RESET_TTL_MIN = 60;

function publicAppUrl(): string {
  return (process.env.PUBLIC_APP_URL || "https://app.tijarflow.com").replace(/\/+$/, "");
}

async function sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
  const link = `${publicAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "Reset your TijarFlow password",
    text: `Hi ${name},\n\nWe received a request to reset your TijarFlow password.\n\nOpen this link to set a new password: ${link}\n\nThe link expires in ${PASSWORD_RESET_TTL_MIN} minutes and can only be used once. If you didn't request a reset, you can safely ignore this email — your password won't change.\n\n— TijarFlow`,
    html: `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:40px auto;padding:32px;background:#f8fafc;border-radius:12px;">
  <h2 style="color:#0f172a;margin:0 0 16px">Reset your password</h2>
  <p style="color:#475569;font-size:15px;line-height:1.5;margin:0 0 24px">Hi ${name}, we received a request to reset your TijarFlow password. Click the button below to choose a new one:</p>
  <div style="text-align:center;margin:0 0 24px">
    <a href="${link}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px">Reset password</a>
  </div>
  <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0 0 8px">Or paste this link into your browser:</p>
  <p style="color:#0d9488;font-size:12px;word-break:break-all;margin:0 0 24px"><a href="${link}" style="color:#0d9488">${link}</a></p>
  <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0">This link expires in ${PASSWORD_RESET_TTL_MIN} minutes and can only be used once. If you didn't request a reset, you can safely ignore this email — your password won't change.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0"/>
  <p style="color:#94a3b8;font-size:12px;margin:0">TijarFlow — AI-powered product photography</p>
</body></html>`,
  });
}

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req: AuthRequest, res: Response): Promise<void> => {
  const genericResponse = () => res.json({
    message: `If an account exists for that email, a password reset link has been sent. Check your inbox — the link expires in ${PASSWORD_RESET_TTL_MIN} minutes.`,
  });

  try {
    const rawEmail = req.body?.email;
    if (typeof rawEmail !== "string" || !rawEmail.trim()) {
      res.status(400).json({ error: "Email is required", code: "VALIDATION_ERROR" });
      return;
    }
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Please provide a valid email address", code: "VALIDATION_ERROR" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, role: true } });
    // Always respond the same whether or not the user exists. Admins use
    // passwordless OTP login, so we silently refuse to reset their passwords.
    if (!user || user.role === "ADMIN") {
      genericResponse();
      return;
    }

    // Invalidate any previous unused tokens for this user so the new one is
    // the only working link.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MIN * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    try {
      await sendPasswordResetEmail(email, user.name, token);
    } catch (err) {
      console.error("[forgot-password] email send failed:", (err as Error)?.message || err);
      // Don't leak the failure — but log it. Merchant will see the generic
      // "check your inbox" response and can retry; support can diagnose from logs.
    }

    genericResponse();
  } catch (err) {
    console.error("[forgot-password] error:", (err as Error)?.message || err);
    // Still respond generically so attackers can't probe based on error shape
    genericResponse();
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body as { token?: unknown; password?: unknown };

    if (typeof token !== "string" || !token.trim()) {
      res.status(400).json({ error: "Reset token is required", code: "VALIDATION_ERROR" });
      return;
    }
    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters", code: "VALIDATION_ERROR" });
      return;
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, role: true } } },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now() || record.user.role === "ADMIN") {
      res.status(400).json({
        error: "This reset link is invalid or has expired. Request a new one.",
        code: "INVALID_TOKEN",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { password: passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Cascade-invalidate any other outstanding tokens for this user
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    res.json({ message: "Password updated. You can now sign in with your new password." });
  } catch (err) {
    console.error("[reset-password] error:", (err as Error)?.message || err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { id: true, email: true, name: true, role: true, language: true, createdAt: true, updatedAt: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
      return;
    }

    res.json({ user });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
