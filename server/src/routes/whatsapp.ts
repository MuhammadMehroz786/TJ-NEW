import crypto from "crypto";
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import { AICreditError, consumeWeeklyAICredit, refundOneCredit, getAICredits } from "../services/aiCredits";
import {
  downloadWhatsAppMedia,
  extractIncomingMessages,
  normalizePhoneNumber,
  sendWhatsAppButtonsMessage,
  sendWhatsAppImageById,
  sendWhatsAppTextMessage,
  uploadWhatsAppMedia,
} from "../services/whatsapp";
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  generateOtp,
  hashOtp,
  sendOtpEmail,
  verifyOtp,
} from "../services/otp";
import { refineProductImage, sanitizeInstruction } from "../services/imageRefinement";
import { addImageToBatch, type PendingImage } from "../services/whatsappBatch";
import { t, plural, resolveLang, type Lang } from "../services/whatsappI18n";
import { saveEnhancementToLibrary } from "../lib/imageStorage";

const router = Router();
const prisma = new PrismaClient();

const SIGNUP_URL = process.env.WHATSAPP_SIGNUP_URL || "https://app.tijarflow.com/signup";

const STATES = {
  AWAITING_LANGUAGE: "awaiting_language",
  AWAITING_ACCOUNT_ANSWER: "awaiting_account_answer",
  AWAITING_EMAIL: "awaiting_email",
  AWAITING_OTP: "awaiting_otp",
  AWAITING_GUEST_IMAGE: "awaiting_guest_image",
  VERIFIED: "verified",
  AWAITING_BATCH_THEME: "awaiting_batch_theme",
  POST_ENHANCEMENT: "post_enhancement",
  EXHAUSTED: "exhausted",
} as const;

function normalizeAnswer(content: string | undefined, interactiveTitle: string | undefined): string {
  return String(interactiveTitle || content || "").trim().toLowerCase();
}

function isRestartTrigger(answer: string): boolean {
  return ["hi", "hello", "start", "restart", "menu", "مرحبا", "أهلا"].includes(answer);
}

const STUDIO_SCENE =
  "a clean pure white infinity-curve studio background with professional three-point lighting (key light, fill light, and rim light), creating soft natural shadows beneath and behind the product";

function buildEnhancementPrompt(sceneDescription: string): string {
  return `You are a professional e-commerce product photographer. Edit this product image following these strict rules:

PRODUCT PRESERVATION (most important):
- Keep the product EXACTLY as it is — same shape, size, proportions, colors, textures, labels, and details.
- Do NOT alter, regenerate, distort, or artistically reinterpret the product in any way.
- Maintain the product's original scale and perspective angle.

BACKGROUND REPLACEMENT:
- Completely remove the existing background.
- Replace it with: ${sceneDescription}.
- The new background must look photorealistic and naturally match the product's perspective and viewing angle.

LIGHTING & SHADOWS:
- Adjust the product's lighting to seamlessly match the new background environment.
- Add realistic, soft contact shadows beneath the product that match the light direction of the scene.
- Ensure consistent color temperature between the product and background.

IMAGE QUALITY:
- Output a sharp, high-resolution, professional e-commerce photograph.
- Enhance clarity and detail on the product without changing its appearance.

STRICT RULES:
- Do NOT add any text, watermarks, logos, or branding.
- Do NOT add extra objects, props, or decorations.
- Do NOT crop or change the framing — keep the product centered.
- The result must look like an authentic photograph, not a composite.`;
}

async function enhanceProductImage(
  base64: string,
  mimeType: string,
  sceneDescription: string = STUDIO_SCENE,
): Promise<{ base64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildEnhancementPrompt(sceneDescription);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ inlineData: { mimeType, data: base64 } }, prompt],
    config: { responseModalities: ["image", "text"] },
  });

  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) throw new Error("No response parts returned.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart?.inlineData) throw new Error("No image data in response.");

  return {
    base64: imagePart.inlineData.data as string,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

async function sendEnhancedImage(to: string, base64: string, mimeType: string, caption?: string): Promise<string | null> {
  const mediaId = await uploadWhatsAppMedia(base64, mimeType);
  return sendWhatsAppImageById({ to, mediaId, caption });
}

async function sendLanguageGate(to: string): Promise<void> {
  // Single text message with bilingual copy — no buttons (we want 1/2 input to
  // double as cross-language shortcuts and keep parsing trivial).
  await sendWhatsAppTextMessage({
    to,
    body: t("en", "language_gate"),
  });
}

async function sendWelcomeMessage(to: string, lang: Lang = "en"): Promise<void> {
  await sendWhatsAppButtonsMessage({
    to,
    body: t(lang, "welcome_body"),
    buttons: [
      { id: "registered_yes", title: t(lang, "btn_registered_yes") },
      { id: "registered_no", title: t(lang, "btn_registered_no") },
    ],
  });
}

async function sendHelp(to: string, lang: Lang = "en", state?: string): Promise<void> {
  // Show a focused mid-flow hint when the user is partway through a known
  // sub-flow. Falls back to the full command list everywhere else.
  const stateToHelpKey: Record<string, "help_mid_email" | "help_mid_otp" | "help_mid_batch_theme" | "help_mid_account_answer"> = {
    [STATES.AWAITING_EMAIL]:          "help_mid_email",
    [STATES.AWAITING_OTP]:            "help_mid_otp",
    [STATES.AWAITING_BATCH_THEME]:    "help_mid_batch_theme",
    [STATES.AWAITING_ACCOUNT_ANSWER]: "help_mid_account_answer",
  };
  const key = (state && stateToHelpKey[state]) || "help";
  await sendWhatsAppTextMessage({ to, body: t(lang, key) });
}

async function sendRefinementButtons(to: string, lang: Lang = "en"): Promise<void> {
  await sendWhatsAppButtonsMessage({
    to,
    body: t(lang, "refinement_buttons_body"),
    buttons: [
      { id: "refine_bg",    title: t(lang, "btn_refine_bg") },
      { id: "refine_light", title: t(lang, "btn_refine_light") },
      { id: "refine_new",   title: t(lang, "btn_refine_new") },
    ],
  });
}

const QUICK_REFINEMENTS: Record<string, string> = {
  refine_bg:    "Replace ONLY the background with a different professional e-commerce scene. Keep the product, its lighting, and the existing exposure level exactly the same.",
  refine_light: "Make the lighting softer and more diffused — add a gentle key light with feathered edges and cleaner soft shadows beneath the product. Do NOT increase overall brightness, do NOT wash out the image, and do NOT reduce contrast. Preserve the existing exposure and color saturation.",
};

/**
 * Reset a session back to the welcome state.
 *   keepCredits  — preserve guest creditsUsed (prevents farming via /start)
 *   preserveLink — keep the merchant link (userId + isVerified). /start should
 *                  NOT unlink — only /logout does that.
 */
async function resetSessionToWelcome(
  sessionId: string,
  keepCredits: boolean,
  currentCreditsUsed: number,
  preserveLink: boolean = false,
  currentUserId: string | null = null,
  currentIsVerified: boolean = false,
): Promise<void> {
  const linkData = preserveLink
    ? { userId: currentUserId, isVerified: currentIsVerified }
    : { userId: null, isVerified: false };

  await prisma.whatsAppSession.update({
    where: { id: sessionId },
    data: {
      // If the user is still linked, drop them into VERIFIED (not the
      // "are you registered?" prompt) so /credits and image flow still work.
      state: preserveLink && currentIsVerified ? STATES.VERIFIED : STATES.AWAITING_ACCOUNT_ANSWER,
      ...linkData,
      emailAttempts: 0,
      otpAttempts: 0,
      pendingEmail: null,
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      pendingTheme: null,
      lastSourceImage: null,
      lastSourceMimeType: null,
      pendingImageIds: [],
      creditsUsed: keepCredits ? currentCreditsUsed : 0,
    },
  });
}

type SessionRow = NonNullable<Awaited<ReturnType<typeof prisma.whatsAppSession.findUnique>>>;

/**
 * Handle slash commands that work from any state. Returns true if handled.
 */
async function handleSlashCommand(answer: string, from: string, session: SessionRow): Promise<boolean> {
  if (!answer.startsWith("/")) return false;
  const cmd = answer.split(/\s+/)[0];
  const lang = resolveLang(session.language);

  switch (cmd) {
    case "/help":
    case "/commands":
      await sendHelp(from, lang, session.state);
      return true;

    case "/language":
    case "/lang":
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { state: STATES.AWAITING_LANGUAGE },
      });
      await sendLanguageGate(from);
      return true;

    case "/start":
    case "/restart":
    case "/clear":
    case "/reset":
      await resetSessionToWelcome(
        session.id,
        true, session.creditsUsed,
        true, session.userId, session.isVerified,
      );
      if (session.isVerified && session.userId) {
        await sendWhatsAppTextMessage({
          to: from,
          body: t(lang, "session_reset_logged_in"),
        });
      } else {
        await sendWelcomeMessage(from, lang);
      }
      return true;

    case "/new":
      if (session.isVerified) {
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { state: STATES.VERIFIED, lastSourceImage: null, lastSourceMimeType: null },
        });
        await sendWhatsAppTextMessage({ to: from, body: t(lang, "new_image_ready_verified") });
      } else {
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { state: STATES.AWAITING_GUEST_IMAGE, lastSourceImage: null, lastSourceMimeType: null },
        });
        const remaining = Math.max(0, session.creditsLimit - session.creditsUsed);
        await sendWhatsAppTextMessage({
          to: from,
          body: t(lang, "new_image_ready_guest", { remaining, plural: plural(remaining, lang) }),
        });
      }
      return true;

    case "/credits":
    case "/balance": {
      if (!session.isVerified || !session.userId) {
        const remaining = Math.max(0, session.creditsLimit - session.creditsUsed);
        await sendWhatsAppTextMessage({
          to: from,
          body: t(lang, "credits_guest", { remaining, limit: session.creditsLimit }),
        });
        return true;
      }
      try {
        const credits = await getAICredits(prisma, session.userId);
        await sendWhatsAppTextMessage({
          to: from,
          body: t(lang, "credits_verified", {
            weekly: credits.weeklyCredits,
            purchased: credits.purchasedCredits,
            total: credits.totalCredits,
          }),
        });
      } catch {
        await sendWhatsAppTextMessage({ to: from, body: t(lang, "credits_fetch_failed") });
      }
      return true;
    }

    case "/logout":
    case "/unlink":
      await resetSessionToWelcome(session.id, false, 0);
      await sendWhatsAppTextMessage({ to: from, body: t(lang, "logged_out") });
      return true;

    default:
      await sendWhatsAppTextMessage({
        to: from,
        body: t(lang, "unknown_command", { cmd }),
      });
      return true;
  }
}

// Meta webhook verification
router.get("/webhook", (req: Request, res: Response): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === verifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: "Verification failed" });
});

function verifyMetaSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length);
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Incoming WhatsApp events/messages — body is raw Buffer (registered in index.ts)
router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    // Signature check is gated on WHATSAPP_APP_SECRET being set. If it's missing,
    // we REJECT in production rather than fail-open silently.
    if (!appSecret) {
      console.error("[WhatsApp] WHATSAPP_APP_SECRET is not set — rejecting webhook POST");
      res.status(503).json({ error: "Webhook not configured" });
      return;
    }
    const sigHeader = req.headers["x-hub-signature-256"];
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!verifyMetaSignature(rawBody, sig, appSecret)) {
      console.warn("[WhatsApp] rejected webhook POST with bad signature");
      res.status(403).json({ error: "Invalid signature" });
      return;
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    const messages = extractIncomingMessages(parsedBody);

    res.status(200).json({ ok: true });

    for (const message of messages) {
      const from = normalizePhoneNumber(message.from);
      const now = new Date();
      const answer = normalizeAnswer(message.text, message.interactiveReplyTitle);

      try {
      let session = await prisma.whatsAppSession.findUnique({ where: { phoneNumber: from } });

      if (!session) {
        session = await prisma.whatsAppSession.create({
          data: {
            phoneNumber: from,
            state: STATES.AWAITING_LANGUAGE,
            lastMessageAt: now,
          },
        });
        await sendLanguageGate(from);
        continue;
      }

      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { lastMessageAt: now },
      });

      // Language gate — pending first-time choice. Accept "1" / "2" / "en" / "ar"
      // / "english" / "عربي". Slash commands also work (e.g. /help) so the user
      // isn't trapped here.
      if (session.state === STATES.AWAITING_LANGUAGE && !answer.startsWith("/")) {
        const pickEn = /^(1|en|eng|english)$/i.test(answer);
        const pickAr = /^(2|ar|ara|arabic|عربي|عربية|العربية)$/.test(answer);
        if (pickEn || pickAr) {
          const newLang: Lang = pickEn ? "en" : "ar";
          const updated = await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: {
              language: newLang,
              state: STATES.AWAITING_ACCOUNT_ANSWER,
            },
          });
          session = updated;
          // Combine language confirmation + welcome into one interactive
          // message so the merchant doesn't get a two-message ping when one
          // would do. The welcome includes its own buttons, so we just send
          // it directly — the language confirmation is implicit in the fact
          // that this whole reply is in the chosen language.
          await sendWelcomeMessage(from, newLang);
          continue;
        }
        // Unclear input — re-prompt
        await sendLanguageGate(from);
        continue;
      }

      if (await handleSlashCommand(answer, from, session)) continue;

      // Reply-to-image refinement: if the user quoted one of our enhanced
      // images with free text, route it directly to refinement regardless of
      // current state. This lets users iterate on any past image at any time.
      if (
        message.type === "text" &&
        message.text &&
        message.contextMessageId &&
        (session.isVerified || session.state === STATES.POST_ENHANCEMENT || session.state === STATES.AWAITING_GUEST_IMAGE)
      ) {
        const match = await prisma.whatsAppEnhancement.findUnique({
          where: { outboundWamid: message.contextMessageId },
        });
        if (match && match.sessionId === session.id) {
          const instruction = message.text.trim();
          if (instruction.length >= 3) {
            await handleRefinement(session, instruction, from, message.contextMessageId);
            continue;
          }
        }
      }

      const lang = resolveLang(session.language);

      if (!session.isVerified && isRestartTrigger(answer)) {
        await resetSessionToWelcome(session.id, false, 0);
        await sendWelcomeMessage(from, lang);
        continue;
      }

      if (session.isVerified && session.state === STATES.VERIFIED) {
        if (message.type === "image" && message.imageId) {
          await handleVerifiedImageEnhancement(session, message.imageId, from);
        } else {
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "verified_idle_prompt"),
          });
        }
        continue;
      }

      if (session.state === STATES.POST_ENHANCEMENT) {
        // New image always starts a fresh enhancement
        if (message.type === "image" && message.imageId) {
          if (session.isVerified) {
            await handleVerifiedImageEnhancement(session, message.imageId, from);
          } else {
            await handleGuestImageEnhancement(session, message.imageId, from);
          }
          continue;
        }

        // Quick-reply button → canned refinement instruction
        const buttonId = message.interactiveReplyId;
        if (buttonId === "refine_new") {
          if (session.isVerified) {
            await prisma.whatsAppSession.update({
              where: { id: session.id },
              data: { state: STATES.VERIFIED, lastSourceImage: null, lastSourceMimeType: null },
            });
            await sendWhatsAppTextMessage({ to: from, body: t(lang, "post_enh_followup") });
          } else {
            await prisma.whatsAppSession.update({
              where: { id: session.id },
              data: { state: STATES.AWAITING_GUEST_IMAGE, lastSourceImage: null, lastSourceMimeType: null },
            });
            const remaining = Math.max(0, session.creditsLimit - session.creditsUsed);
            await sendWhatsAppTextMessage({
              to: from,
              body: t(lang, "post_enh_followup_guest", { remaining, plural: plural(remaining, lang) }),
            });
          }
          continue;
        }
        if (buttonId && QUICK_REFINEMENTS[buttonId]) {
          await handleRefinement(session, QUICK_REFINEMENTS[buttonId], from);
          continue;
        }

        // Free-text refinement — may target a specific image via reply-quote
        if (message.type === "text" && message.text) {
          const instruction = message.text.trim();
          if (instruction.length < 3) {
            await sendWhatsAppTextMessage({ to: from, body: t(lang, "theme_too_short") });
            continue;
          }
          await handleRefinement(session, instruction, from, message.contextMessageId);
          continue;
        }

        await sendWhatsAppTextMessage({ to: from, body: t(lang, "refine_hint_fallback") });
        continue;
      }

      if (session.state === STATES.AWAITING_ACCOUNT_ANSWER || session.state === "idle") {
        if (answer === "yes" || answer === "yes, i'm registered" ||
            answer === t(lang, "btn_registered_yes").toLowerCase()) {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: STATES.AWAITING_EMAIL, emailAttempts: 0 },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "enter_email"),
          });
          continue;
        }

        if (answer === "no" || answer === "no, use free trial" ||
            answer === t(lang, "btn_registered_no").toLowerCase()) {
          // Do NOT reset creditsUsed. 5 free enhancements are lifetime per phone
          // number — a guest who exhausted their trial can't re-trigger it by
          // restarting and answering "No" again.
          const alreadyUsed = session.creditsUsed;
          const limit = session.creditsLimit || 5;
          const remaining = Math.max(0, limit - alreadyUsed);
          if (remaining <= 0) {
            await prisma.whatsAppSession.update({
              where: { id: session.id },
              data: {
                state: STATES.EXHAUSTED,
                creditsLimit: limit,
                isVerified: false,
                userId: null,
              },
            });
            await sendWhatsAppTextMessage({
              to: from,
              body: t(lang, "guest_trial_exhausted", { signup: SIGNUP_URL }),
            });
            continue;
          }
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: {
              state: STATES.AWAITING_GUEST_IMAGE,
              creditsLimit: limit,
              isVerified: false,
              userId: null,
            },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "guest_trial_started", { remaining, plural: plural(remaining, lang) }),
          });
          continue;
        }

        await sendWelcomeMessage(from, lang);
        continue;
      }

      if (session.state === STATES.AWAITING_EMAIL) {
        if (message.type !== "text" || !message.text) {
          await sendWhatsAppTextMessage({ to: from, body: t(lang, "enter_email_text_only") });
          continue;
        }

        const email = message.text.trim().toLowerCase();
        const user = await prisma.user.findFirst({
          where: { email, role: "MERCHANT" },
          select: { id: true },
        });

        if (!user) {
          const attempts = session.emailAttempts + 1;
          if (attempts >= 3) {
            await resetSessionToWelcome(session.id, false, 0);
            await sendWhatsAppTextMessage({
              to: from,
              body: t(lang, "email_not_found_final", { signup: SIGNUP_URL }),
            });
            continue;
          }
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { emailAttempts: attempts },
          });
          const left = 3 - attempts;
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "email_not_found_retry", { left, plural: plural(left, lang) }),
          });
          continue;
        }

        const otp = generateOtp();
        try {
          await sendOtpEmail(email, otp);
        } catch (err) {
          console.error("[WhatsApp] OTP email send failed:", (err as Error)?.message || err);
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "otp_email_send_failed"),
          });
          continue;
        }

        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: {
            state: STATES.AWAITING_OTP,
            pendingEmail: email,
            emailOtpHash: hashOtp(otp),
            emailOtpExpiresAt: expiresAt,
            otpAttempts: 0,
            emailAttempts: 0,
          },
        });

        await sendWhatsAppTextMessage({
          to: from,
          body: t(lang, "otp_sent", { email, ttl: OTP_TTL_MINUTES }),
        });
        continue;
      }

      if (session.state === STATES.AWAITING_OTP) {
        if (message.type !== "text" || !message.text) {
          await sendWhatsAppTextMessage({ to: from, body: t(lang, "otp_enter_digits") });
          continue;
        }

        const input = message.text.trim().replace(/\D/g, "");
        if (input.length !== 6) {
          await sendWhatsAppTextMessage({ to: from, body: t(lang, "otp_must_be_6") });
          continue;
        }

        if (!session.emailOtpHash || !session.emailOtpExpiresAt || !session.pendingEmail) {
          await resetSessionToWelcome(session.id, false, 0);
          await sendWelcomeMessage(from, lang);
          continue;
        }

        if (session.emailOtpExpiresAt.getTime() < Date.now()) {
          await resetSessionToWelcome(session.id, false, 0);
          await sendWhatsAppTextMessage({ to: from, body: t(lang, "otp_expired") });
          continue;
        }

        if (!verifyOtp(input, session.emailOtpHash)) {
          const attempts = session.otpAttempts + 1;
          if (attempts >= OTP_MAX_ATTEMPTS) {
            await resetSessionToWelcome(session.id, false, 0);
            await sendWhatsAppTextMessage({
              to: from,
              body: t(lang, "otp_too_many_attempts"),
            });
            continue;
          }
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { otpAttempts: attempts },
          });
          const left = OTP_MAX_ATTEMPTS - attempts;
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "otp_incorrect", { left, plural: plural(left, lang) }),
          });
          continue;
        }

        const user = await prisma.user.findFirst({
          where: { email: session.pendingEmail, role: "MERCHANT" },
          select: { id: true, name: true },
        });
        if (!user) {
          await resetSessionToWelcome(session.id, false, 0);
          await sendWhatsAppTextMessage({ to: from, body: t(lang, "account_unavailable") });
          continue;
        }

        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: {
            userId: user.id,
            isVerified: true,
            state: STATES.VERIFIED,
            emailOtpHash: null,
            emailOtpExpiresAt: null,
            pendingEmail: null,
            otpAttempts: 0,
          },
        });

        let creditsInfo = "";
        try {
          const credits = await getAICredits(prisma, user.id);
          const purchasedSuffix = credits.purchasedCredits > 0
            ? t(lang, "credits_info_purchased_suffix", { purchased: credits.purchasedCredits })
            : "";
          creditsInfo = t(lang, "credits_info_verified", {
            weekly: credits.weeklyCredits,
            purchased: purchasedSuffix,
          });
        } catch {
          // non-critical
        }

        await sendWhatsAppTextMessage({
          to: from,
          body: t(lang, "verified_welcome", { name: user.name, creditsInfo }),
        });
        continue;
      }

      if (session.state === STATES.AWAITING_BATCH_THEME) {
        // User may have sent another image while we were waiting — queue it
        // and keep waiting for the theme text.
        if (message.type === "image" && message.imageId) {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { pendingImageIds: [...session.pendingImageIds, message.imageId] },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "batch_added", { count: session.pendingImageIds.length + 1 }),
          });
          continue;
        }

        if (message.type !== "text" || !message.text) {
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "theme_text_only"),
          });
          continue;
        }
        const theme = sanitizeInstruction(message.text);
        if (theme.length < 3) {
          await sendWhatsAppTextMessage({ to: from, body: t(lang, "theme_too_short") });
          continue;
        }
        if (session.pendingImageIds.length === 0) {
          // Shouldn't happen, but guard anyway
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: session.isVerified ? STATES.VERIFIED : STATES.AWAITING_GUEST_IMAGE },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "theme_no_images"),
          });
          continue;
        }
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { pendingTheme: theme },
        });
        // Kick off processing now with the saved images + theme
        await processBatch(session, session.pendingImageIds, theme, from);
        continue;
      }

      if (session.state === STATES.AWAITING_GUEST_IMAGE || session.state === STATES.EXHAUSTED) {
        const creditsRemaining = Math.max(0, session.creditsLimit - session.creditsUsed);

        if (creditsRemaining <= 0) {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: STATES.EXHAUSTED },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "guest_exhausted_inline", { signup: SIGNUP_URL }),
          });
          continue;
        }

        if (message.type !== "image" || !message.imageId) {
          await sendWhatsAppTextMessage({
            to: from,
            body: t(lang, "guest_remaining_hint", { remaining: creditsRemaining, plural: plural(creditsRemaining, lang) }),
          });
          continue;
        }

        await handleGuestImageEnhancement(session, message.imageId, from);
        continue;
      }

      // Fallback
      await resetSessionToWelcome(session.id, false, 0);
      await sendWelcomeMessage(from, lang);
      } catch (msgErr) {
        const err = msgErr as Error;
        console.error(
          `[WhatsApp] message handling failed`,
          JSON.stringify({
            phoneNumber: from,
            messageType: message.type,
            interactiveReplyId: message.interactiveReplyId,
            answer: answer.slice(0, 40),
            error: err?.message || String(err),
          }),
        );
      }
    }
  } catch (error) {
    const err = error as Error;
    console.error(`[WhatsApp] webhook batch failed: ${err?.message || String(err)}`);
  }
});

/**
 * Enqueue an inbound image into the per-user batch window. First image gets
 * an ack message; subsequent images are added silently to avoid chat spam.
 * After 5s of silence the batch is flushed — at which point we ASK for a
 * theme and persist the image IDs to the session for the theme-handler to
 * pick up.
 */
async function enqueueImage(session: SessionRow, imageId: string, from: string): Promise<void> {
  const lang = resolveLang(session.language);
  const result = addImageToBatch(from, imageId, async (phoneNumber, images) => {
    const freshSession = await prisma.whatsAppSession.findUnique({ where: { phoneNumber } });
    if (!freshSession) return;
    await askForBatchTheme(freshSession, images, phoneNumber);
  });

  if (result.newBatch) {
    await sendWhatsAppTextMessage({
      to: from,
      body: t(lang, "batch_first_image"),
    });
  }
}

/**
 * After the batch window closes, persist the pending image IDs and ask the
 * user which theme/background to apply. The reply is caught by the
 * AWAITING_BATCH_THEME state handler and triggers processBatch.
 */
async function askForBatchTheme(session: SessionRow, images: PendingImage[], from: string): Promise<void> {
  if (images.length === 0) return;
  const lang = resolveLang(session.language);
  const imageIds = images.map((i) => i.imageId);

  await prisma.whatsAppSession.update({
    where: { id: session.id },
    data: {
      state: STATES.AWAITING_BATCH_THEME,
      pendingImageIds: imageIds,
    },
  });

  const count = images.length;
  await sendWhatsAppTextMessage({
    to: from,
    body: t(lang, "ask_theme", { count, plural: plural(count, lang) }),
  });
}

/**
 * Process a batch of queued images with a specified theme. Downloads, consumes
 * credits (one per image), enhances in parallel, sends results back, persists
 * enhancement records so follow-up replies can target a specific image.
 */
async function processBatch(session: SessionRow, imageIds: string[], theme: string, from: string): Promise<void> {
  if (imageIds.length === 0) return;
  const lang = resolveLang(session.language);

  const total = imageIds.length;
  let canEnhance = total;

  if (session.isVerified && session.userId) {
    try {
      const balance = await getAICredits(prisma, session.userId);
      canEnhance = Math.min(total, balance.totalCredits);
      if (canEnhance === 0) {
        await sendWhatsAppTextMessage({
          to: from,
          body: t(lang, "credits_exhausted_weekly", { signup: SIGNUP_URL }),
        });
        return;
      }
    } catch {
      canEnhance = total; // fail-open; individual consumes will enforce
    }
  } else {
    const remaining = Math.max(0, session.creditsLimit - session.creditsUsed);
    canEnhance = Math.min(total, remaining);
    if (canEnhance === 0) {
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { state: STATES.EXHAUSTED },
      });
      await sendWhatsAppTextMessage({
        to: from,
        body: t(lang, "guest_exhausted_inline", { signup: SIGNUP_URL }),
      });
      return;
    }
  }

  const skipped = total - canEnhance;
  await sendWhatsAppTextMessage({
    to: from,
    body: skipped > 0
      ? t(lang, "enhancing_count_partial", { enhanceCount: canEnhance, total, skipped })
      : t(lang, "enhancing_count", { count: canEnhance, plural: plural(canEnhance, lang) }),
  });

  const toProcess = imageIds.slice(0, canEnhance);

  // Process in parallel but surface per-image failures individually.
  // Capture which credit pool was charged BEFORE the work started, so the
  // failure path knows what to refund. Previously the failed branch lost
  // this information and verified merchants weren't refunded.
  const results = await Promise.all(
    toProcess.map(async (imageId) => {
      let usedPool: "weekly" | "purchased" | null = null;
      try {
        if (session.isVerified && session.userId) {
          const usage = await consumeWeeklyAICredit(prisma, session.userId);
          usedPool = usage.usedPool;
        } else {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { creditsUsed: { increment: 1 } },
          });
        }

        const media = await downloadWhatsAppMedia(imageId);
        const enhanced = await enhanceProductImage(media.base64, media.mimeType, theme);
        return { ok: true as const, media, enhanced, usedPool };
      } catch (err) {
        console.error("[WhatsApp] batch item failed:", (err as Error)?.message || err);
        return { ok: false as const, usedPool, error: (err as Error)?.message || "Enhancement failed" };
      }
    }),
  );

  // Refund any credits for failed items — guests get the session counter
  // decremented; verified merchants get the credit returned to the same
  // pool (weekly/purchased) it was consumed from.
  for (const r of results) {
    if (r.ok) continue;
    if (session.isVerified && session.userId && r.usedPool) {
      await refundOneCredit(prisma, session.userId, r.usedPool);
    } else if (!session.isVerified) {
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { creditsUsed: { decrement: 1 } },
      });
    }
  }

  // Send each successful image with a numbered caption so users know which is which
  let successCount = 0;
  let lastSourceImage: string | null = null;
  let lastSourceMimeType: string | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.ok) continue;
    const caption = toProcess.length > 1 ? t(lang, "caption_image_of", { i: i + 1, total: toProcess.length }) : undefined;
    try {
      const wamid = await sendEnhancedImage(from, r.enhanced.base64, r.enhanced.mimeType, caption);
      successCount++;
      lastSourceImage = r.media.base64;
      lastSourceMimeType = r.media.mimeType;

      if (wamid) {
        await prisma.whatsAppEnhancement.create({
          data: {
            sessionId: session.id,
            outboundWamid: wamid,
            sourceImage: r.media.base64,
            sourceMimeType: r.media.mimeType,
          },
        });
      }

      // Auto-save to the merchant's AI Studio library so they can access
      // WhatsApp-enhanced images from the web. Guests have no userId so skip.
      // Best-effort: library-save failure must not block the WhatsApp reply.
      if (session.isVerified && session.userId) {
        try {
          await saveEnhancementToLibrary(prisma, {
            userId: session.userId,
            base64: r.enhanced.base64,
            mimeType: r.enhanced.mimeType,
            background: "whatsapp",
            folderName: "WhatsApp",
          });
        } catch (libErr) {
          console.error("[WhatsApp] save to AI Studio library failed:", (libErr as Error)?.message || libErr);
        }
      }
    } catch (err) {
      console.error("[WhatsApp] send enhanced image failed:", (err as Error)?.message || err);
    }
  }

  // Update session — refinement fallback uses the last image in the batch.
  // pendingImageIds is cleared so subsequent theme replies don't reprocess.
  await prisma.whatsAppSession.update({
    where: { id: session.id },
    data: {
      state: STATES.POST_ENHANCEMENT,
      lastSourceImage: lastSourceImage ?? session.lastSourceImage,
      lastSourceMimeType: lastSourceMimeType ?? session.lastSourceMimeType,
      pendingImageIds: [],
    },
  });

  // Summary
  const failureCount = results.length - successCount;
  const summaryParts: string[] = [];
  if (successCount > 0) summaryParts.push(t(lang, "summary_enhanced", { n: successCount }));
  if (failureCount > 0) summaryParts.push(t(lang, "summary_failed", { n: failureCount }));
  if (skipped > 0) summaryParts.push(t(lang, "summary_skipped", { n: skipped }));

  let footer = "";
  if (session.isVerified && session.userId) {
    try {
      const balance = await getAICredits(prisma, session.userId);
      const purchasedSuffix = balance.purchasedCredits > 0
        ? t(lang, "credits_info_purchased_suffix", { purchased: balance.purchasedCredits })
        : "";
      footer = t(lang, "summary_footer_verified", { weekly: balance.weeklyCredits, purchased: purchasedSuffix });
    } catch { /* non-critical */ }
  } else {
    const fresh = await prisma.whatsAppSession.findUnique({
      where: { id: session.id },
      select: { creditsUsed: true, creditsLimit: true },
    });
    if (fresh) {
      const rem = Math.max(0, fresh.creditsLimit - fresh.creditsUsed);
      footer = t(lang, "summary_footer_guest", { remaining: rem });
      if (rem === 0) {
        await prisma.whatsAppSession.update({ where: { id: session.id }, data: { state: STATES.EXHAUSTED } });
      }
    }
  }

  await sendWhatsAppTextMessage({
    to: from,
    body: `${summaryParts.join(" · ") || t(lang, "summary_done_fallback")}${footer}`,
  });
}

// Backwards-compatible wrappers (some callsites still use these names)
async function handleVerifiedImageEnhancement(session: SessionRow, imageId: string, from: string): Promise<void> {
  await enqueueImage(session, imageId, from);
}
async function handleGuestImageEnhancement(session: SessionRow, imageId: string, from: string): Promise<void> {
  await enqueueImage(session, imageId, from);
}

async function handleRefinement(
  session: SessionRow,
  instruction: string,
  from: string,
  replyToWamid?: string,
): Promise<void> {
  const lang = resolveLang(session.language);

  // Resolve source image: prefer the specific image the user replied to,
  // otherwise fall back to the most recent enhancement in this session.
  let sourceImage = session.lastSourceImage;
  let sourceMimeType = session.lastSourceMimeType;

  if (replyToWamid) {
    const quoted = await prisma.whatsAppEnhancement.findUnique({
      where: { outboundWamid: replyToWamid },
    });
    if (quoted && quoted.sessionId === session.id) {
      sourceImage = quoted.sourceImage;
      sourceMimeType = quoted.sourceMimeType;
    }
  }

  if (!sourceImage || !sourceMimeType) {
    await sendWhatsAppTextMessage({ to: from, body: t(lang, "refine_no_source") });
    return;
  }

  // Credit check + consume. Capture which pool (weekly/purchased) was charged
  // so the catch{} below can refund the right one if Gemini rejects this call.
  let consumedPool: "weekly" | "purchased" | null = null;
  if (session.isVerified && session.userId) {
    try {
      const usage = await consumeWeeklyAICredit(prisma, session.userId);
      consumedPool = usage.usedPool;
    } catch (err) {
      if (err instanceof AICreditError) {
        await sendWhatsAppTextMessage({
          to: from,
          body: t(lang, "credits_exhausted_weekly", { signup: SIGNUP_URL }),
        });
        return;
      }
      throw err;
    }
  } else {
    const remaining = Math.max(0, session.creditsLimit - session.creditsUsed);
    if (remaining <= 0) {
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { state: STATES.EXHAUSTED },
      });
      await sendWhatsAppTextMessage({
        to: from,
        body: t(lang, "guest_exhausted_inline", { signup: SIGNUP_URL }),
      });
      return;
    }
    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: { creditsUsed: { increment: 1 } },
    });
  }

  await sendWhatsAppTextMessage({ to: from, body: t(lang, "refine_applying") });

  try {
    const refined = await refineProductImage(sourceImage, sourceMimeType, instruction);
    const outWamid = await sendEnhancedImage(from, refined.base64, refined.mimeType);

    if (outWamid) {
      await prisma.whatsAppEnhancement.create({
        data: {
          sessionId: session.id,
          outboundWamid: outWamid,
          sourceImage: refined.base64,
          sourceMimeType: refined.mimeType,
        },
      });
    }

    // Auto-save refined image to the merchant's AI Studio library
    if (session.isVerified && session.userId) {
      try {
        await saveEnhancementToLibrary(prisma, {
          userId: session.userId,
          base64: refined.base64,
          mimeType: refined.mimeType,
          background: "whatsapp-refine",
          folderName: "WhatsApp",
        });
      } catch (libErr) {
        console.error("[WhatsApp] save refine to library failed:", (libErr as Error)?.message || libErr);
      }
    }

    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        state: STATES.POST_ENHANCEMENT,
        lastSourceImage: refined.base64,
        lastSourceMimeType: refined.mimeType,
      },
    });

    // Balance summary
    let summary = t(lang, "refine_applied_fallback");
    if (session.isVerified && session.userId) {
      try {
        const credits = await getAICredits(prisma, session.userId);
        const purchasedSuffix = credits.purchasedCredits > 0
          ? t(lang, "credits_info_purchased_suffix", { purchased: credits.purchasedCredits })
          : "";
        summary = t(lang, "refine_applied_verified", { weekly: credits.weeklyCredits, purchased: purchasedSuffix });
      } catch {
        // non-critical
      }
    } else {
      const fresh = await prisma.whatsAppSession.findUnique({
        where: { id: session.id },
        select: { creditsUsed: true, creditsLimit: true },
      });
      if (fresh) {
        const remaining = Math.max(0, fresh.creditsLimit - fresh.creditsUsed);
        summary = t(lang, "refine_applied_guest", { remaining, plural: plural(remaining, lang) });
      }
    }
    await sendWhatsAppTextMessage({ to: from, body: summary });
    await sendRefinementButtons(from, lang);
  } catch (err) {
    console.error("WhatsApp refinement error:", err);
    // Refund whichever pool we drained — guests get their guest-trial counter
    // decremented; verified merchants get the credit returned to the same
    // pool (weekly or purchased) it came from.
    if (session.isVerified && session.userId && consumedPool) {
      await refundOneCredit(prisma, session.userId, consumedPool);
    } else if (!session.isVerified) {
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { creditsUsed: { decrement: 1 } },
      });
    }
    await sendWhatsAppTextMessage({ to: from, body: t(lang, "refine_failed") });
  }
}

export default router;
