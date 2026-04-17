import crypto from "crypto";
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import { AICreditError, consumeWeeklyAICredit, getAICredits } from "../services/aiCredits";
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

const router = Router();
const prisma = new PrismaClient();

const SIGNUP_URL = process.env.WHATSAPP_SIGNUP_URL || "https://app.tijarflow.com/signup";

const STATES = {
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

async function sendWelcomeMessage(to: string): Promise<void> {
  await sendWhatsAppButtonsMessage({
    to,
    body: "Welcome to TijarFlow AI Assistant! 🛍️\n\nSend us your product photos and we'll enhance them with a professional studio background.\n\nAre you already registered on TijarFlow as a merchant?",
    buttons: [
      { id: "registered_yes", title: "Yes, I'm registered" },
      { id: "registered_no", title: "No, use free trial" },
    ],
  });
}

async function sendHelp(to: string): Promise<void> {
  await sendWhatsAppTextMessage({
    to,
    body:
      "🤖 *TijarFlow Bot Commands*\n\n" +
      "/start — Restart the conversation\n" +
      "/clear — Reset your session\n" +
      "/credits — Check your credit balance\n" +
      "/new — Start fresh with a new image\n" +
      "/logout — Unlink your merchant account\n" +
      "/help — Show this menu\n\n" +
      "📸 *How to use:*\n" +
      "• Send one or multiple product images — I'll enhance them all together after 5 seconds.\n" +
      "• *Reply* to any enhanced image with instructions like _make background darker_ to refine just that one.\n" +
      "• Or type a new refinement to tweak your most recent image.",
  });
}

async function sendRefinementButtons(to: string): Promise<void> {
  await sendWhatsAppButtonsMessage({
    to,
    body: "Want to tweak it? Pick a quick refinement or type your own (e.g. _brighter lighting_, _closer crop_, _warmer tones_).",
    buttons: [
      { id: "refine_bg",    title: "Change background" },
      { id: "refine_light", title: "Softer lighting" },
      { id: "refine_new",   title: "New image" },
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

  switch (cmd) {
    case "/help":
    case "/commands":
      await sendHelp(from);
      return true;

    case "/start":
    case "/restart":
    case "/clear":
    case "/reset":
      // Preserve the guest credit counter (no farming via /start).
      // Preserve the merchant link if the user is verified — they shouldn't
      // have to re-OTP every time they reset the chat. /logout clears both.
      await resetSessionToWelcome(
        session.id,
        true, session.creditsUsed,
        true, session.userId, session.isVerified,
      );
      if (session.isVerified && session.userId) {
        await sendWhatsAppTextMessage({
          to: from,
          body: "✅ Session reset — you're still logged in.\n\nSend your product image(s) or type /help.",
        });
      } else {
        await sendWelcomeMessage(from);
      }
      return true;

    case "/new":
      if (session.isVerified) {
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { state: STATES.VERIFIED, lastSourceImage: null, lastSourceMimeType: null },
        });
        await sendWhatsAppTextMessage({ to: from, body: "✨ Ready for a new image. Send your next product photo." });
      } else {
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { state: STATES.AWAITING_GUEST_IMAGE, lastSourceImage: null, lastSourceMimeType: null },
        });
        const remaining = Math.max(0, session.creditsLimit - session.creditsUsed);
        await sendWhatsAppTextMessage({ to: from, body: `✨ Ready for a new image. Send your next product photo. *${remaining}* free enhancement${remaining === 1 ? "" : "s"} remaining.` });
      }
      return true;

    case "/credits":
    case "/balance": {
      if (!session.isVerified || !session.userId) {
        const remaining = Math.max(0, session.creditsLimit - session.creditsUsed);
        await sendWhatsAppTextMessage({
          to: from,
          body: `💳 Guest credits: *${remaining}* of ${session.creditsLimit} remaining.\n\nType /start to link a merchant account.`,
        });
        return true;
      }
      try {
        const credits = await getAICredits(prisma, session.userId);
        await sendWhatsAppTextMessage({
          to: from,
          body: `💳 *Your credit balance*\n• Weekly: ${credits.weeklyCredits} (resets Monday)\n• Purchased: ${credits.purchasedCredits}\n• Total: ${credits.totalCredits}`,
        });
      } catch {
        await sendWhatsAppTextMessage({ to: from, body: "Could not fetch your credit balance. Please try again." });
      }
      return true;
    }

    case "/logout":
    case "/unlink":
      await resetSessionToWelcome(session.id, false, 0);
      await sendWhatsAppTextMessage({ to: from, body: "✅ You've been logged out. Type /start to begin again." });
      return true;

    default:
      await sendWhatsAppTextMessage({
        to: from,
        body: `Unknown command: ${cmd}\n\nType /help to see available commands.`,
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
            state: STATES.AWAITING_ACCOUNT_ANSWER,
            lastMessageAt: now,
          },
        });
        await sendWelcomeMessage(from);
        continue;
      }

      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { lastMessageAt: now },
      });

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

      if (!session.isVerified && isRestartTrigger(answer)) {
        await resetSessionToWelcome(session.id, false, 0);
        await sendWelcomeMessage(from);
        continue;
      }

      if (session.isVerified && session.state === STATES.VERIFIED) {
        if (message.type === "image" && message.imageId) {
          await handleVerifiedImageEnhancement(session, message.imageId, from);
        } else {
          await sendWhatsAppTextMessage({
            to: from,
            body: "✅ Send your product image(s) — one or many. After I receive them I'll ask what theme to apply.\n\nType /help for commands.",
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
            await sendWhatsAppTextMessage({ to: from, body: "✨ Send your next product image." });
          } else {
            await prisma.whatsAppSession.update({
              where: { id: session.id },
              data: { state: STATES.AWAITING_GUEST_IMAGE, lastSourceImage: null, lastSourceMimeType: null },
            });
            const remaining = Math.max(0, session.creditsLimit - session.creditsUsed);
            await sendWhatsAppTextMessage({ to: from, body: `✨ Send your next product image. *${remaining}* free enhancement${remaining === 1 ? "" : "s"} remaining.` });
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
            await sendWhatsAppTextMessage({ to: from, body: "Please describe the refinement in a bit more detail (at least 3 characters)." });
            continue;
          }
          await handleRefinement(session, instruction, from, message.contextMessageId);
          continue;
        }

        await sendWhatsAppTextMessage({ to: from, body: "Type a refinement (e.g. _brighter_), tap a button, or send a new image. /new to start over." });
        continue;
      }

      if (session.state === STATES.AWAITING_ACCOUNT_ANSWER || session.state === "idle") {
        if (answer === "yes" || answer === "yes, i'm registered") {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: STATES.AWAITING_EMAIL, emailAttempts: 0 },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: "Please enter the email address you used to register on TijarFlow. We'll send a 6-digit code to verify it's you.",
          });
          continue;
        }

        if (answer === "no" || answer === "no, use free trial") {
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
              body:
                `You've already used your 5 free enhancements. 🎉\n\n` +
                `Sign up for TijarFlow to get 50 AI credits every week:\n${SIGNUP_URL}\n\n` +
                `Or type /start and pick "Yes, I'm registered" to link an existing account.`,
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
            body:
              `Great! You have *${remaining}* free AI enhancement${remaining === 1 ? "" : "s"} left. 🎨\n\n` +
              `Send me your product image(s) — one or many. After I receive them I'll ask what theme to apply.`,
          });
          continue;
        }

        await sendWelcomeMessage(from);
        continue;
      }

      if (session.state === STATES.AWAITING_EMAIL) {
        if (message.type !== "text" || !message.text) {
          await sendWhatsAppTextMessage({ to: from, body: "Please type your registered TijarFlow merchant email address." });
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
              body: `We could not find a merchant account with that email after 3 attempts.\n\nType /start to try again or visit ${SIGNUP_URL} to create an account.`,
            });
            continue;
          }
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { emailAttempts: attempts },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: `❌ No merchant account found for that email. ${3 - attempts} attempt${3 - attempts === 1 ? "" : "s"} remaining.`,
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
            body: "⚠️ We can't send verification emails right now. Please try again in a few minutes or contact support.",
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
          body: `📧 A 6-digit verification code has been sent to *${email}*.\n\nReply with the code to link your account (valid for ${OTP_TTL_MINUTES} minutes).`,
        });
        continue;
      }

      if (session.state === STATES.AWAITING_OTP) {
        if (message.type !== "text" || !message.text) {
          await sendWhatsAppTextMessage({ to: from, body: "Please enter the 6-digit verification code sent to your email." });
          continue;
        }

        const input = message.text.trim().replace(/\D/g, "");
        if (input.length !== 6) {
          await sendWhatsAppTextMessage({ to: from, body: "The code must be 6 digits. Please try again." });
          continue;
        }

        if (!session.emailOtpHash || !session.emailOtpExpiresAt || !session.pendingEmail) {
          await resetSessionToWelcome(session.id, false, 0);
          await sendWelcomeMessage(from);
          continue;
        }

        if (session.emailOtpExpiresAt.getTime() < Date.now()) {
          await resetSessionToWelcome(session.id, false, 0);
          await sendWhatsAppTextMessage({ to: from, body: "⏰ That code has expired. Type /start to try again." });
          continue;
        }

        if (!verifyOtp(input, session.emailOtpHash)) {
          const attempts = session.otpAttempts + 1;
          if (attempts >= OTP_MAX_ATTEMPTS) {
            await resetSessionToWelcome(session.id, false, 0);
            await sendWhatsAppTextMessage({
              to: from,
              body: `❌ Too many invalid codes. Type /start to begin again.`,
            });
            continue;
          }
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { otpAttempts: attempts },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: `❌ Incorrect code. ${OTP_MAX_ATTEMPTS - attempts} attempt${OTP_MAX_ATTEMPTS - attempts === 1 ? "" : "s"} remaining.`,
          });
          continue;
        }

        const user = await prisma.user.findFirst({
          where: { email: session.pendingEmail, role: "MERCHANT" },
          select: { id: true, name: true },
        });
        if (!user) {
          await resetSessionToWelcome(session.id, false, 0);
          await sendWhatsAppTextMessage({ to: from, body: "That account is no longer available. Type /start to try again." });
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
          creditsInfo = `\n\n💳 Credits: ${credits.weeklyCredits} weekly${credits.purchasedCredits > 0 ? ` + ${credits.purchasedCredits} purchased` : ""}.`;
        } catch {
          // non-critical
        }

        await sendWhatsAppTextMessage({
          to: from,
          body: `✅ Welcome back, ${user.name}! Your account is now linked.${creditsInfo}\n\nSend your product image(s). After you're done I'll ask what theme to apply.`,
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
            body: `✨ Added to your batch (${session.pendingImageIds.length + 1} total). Send the theme text to start enhancement.`,
          });
          continue;
        }

        if (message.type !== "text" || !message.text) {
          await sendWhatsAppTextMessage({
            to: from,
            body: "Please describe the theme as a text message. Example: _clean white studio background_",
          });
          continue;
        }
        const theme = sanitizeInstruction(message.text);
        if (theme.length < 3) {
          await sendWhatsAppTextMessage({ to: from, body: "Please provide a more descriptive theme (at least 3 characters)." });
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
            body: "I don't have any pending images — please send an image first.",
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
            body: `Your 5 free enhancements are used up! 🎉\n\nSign up for TijarFlow to get 50 AI credits every week:\n${SIGNUP_URL}\n\nAlready have an account? Type /start and pick "Yes, I'm registered".`,
          });
          continue;
        }

        if (message.type !== "image" || !message.imageId) {
          await sendWhatsAppTextMessage({
            to: from,
            body: `You have *${creditsRemaining}* free enhancement${creditsRemaining === 1 ? "" : "s"} remaining.\n\nSend a product image to use one! 📸`,
          });
          continue;
        }

        await handleGuestImageEnhancement(session, message.imageId, from);
        continue;
      }

      // Fallback
      await resetSessionToWelcome(session.id, false, 0);
      await sendWelcomeMessage(from);
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
  const result = addImageToBatch(from, imageId, async (phoneNumber, images) => {
    const freshSession = await prisma.whatsAppSession.findUnique({ where: { phoneNumber } });
    if (!freshSession) return;
    await askForBatchTheme(freshSession, images, phoneNumber);
  });

  if (result.newBatch) {
    await sendWhatsAppTextMessage({
      to: from,
      body: "✨ Got your image! Send more if you want — I'll ask for the theme after a few seconds of silence.",
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
    body:
      `Got ${count} image${count === 1 ? "" : "s"}! 📸\n\n` +
      `What theme or background would you like?\n\n` +
      `Examples:\n• _clean white studio_\n• _marble kitchen counter_\n• _outdoor sunset scene_\n• _minimal black background_\n\n` +
      `Send your theme as a text message.`,
  });
}

/**
 * Process a batch of queued images with a specified theme. Downloads, consumes
 * credits (one per image), enhances in parallel, sends results back, persists
 * enhancement records so follow-up replies can target a specific image.
 */
async function processBatch(session: SessionRow, imageIds: string[], theme: string, from: string): Promise<void> {
  if (imageIds.length === 0) return;

  const total = imageIds.length;
  let canEnhance = total;

  if (session.isVerified && session.userId) {
    try {
      const balance = await getAICredits(prisma, session.userId);
      canEnhance = Math.min(total, balance.totalCredits);
      if (canEnhance === 0) {
        await sendWhatsAppTextMessage({
          to: from,
          body: `⚠️ You've used all your AI credits. They reset every Monday.\n\nVisit ${SIGNUP_URL} to purchase more credits.`,
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
        body: `Your 5 free enhancements are used up! 🎉\n\nSign up: ${SIGNUP_URL}\n\nAlready have an account? Type /start.`,
      });
      return;
    }
  }

  const skipped = total - canEnhance;
  await sendWhatsAppTextMessage({
    to: from,
    body: skipped > 0
      ? `🎨 Enhancing ${canEnhance} of ${total} images (${skipped} skipped — not enough credits). This may take a moment...`
      : `🎨 Enhancing ${canEnhance} image${canEnhance === 1 ? "" : "s"}... This may take a moment.`,
  });

  const toProcess = imageIds.slice(0, canEnhance);

  // Process in parallel but surface per-image failures individually
  const results = await Promise.all(
    toProcess.map(async (imageId) => {
      try {
        let usedPool: "weekly" | "purchased" | null = null;
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
        return { ok: false as const, error: (err as Error)?.message || "Enhancement failed" };
      }
    }),
  );

  // Refund any credits for failed items
  for (const r of results) {
    if (!r.ok) {
      if (session.isVerified && session.userId && r !== undefined && "usedPool" in r && r.usedPool) {
        // Can't happen here because failed path doesn't have usedPool, but keep the guard.
      } else if (!session.isVerified) {
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { creditsUsed: { decrement: 1 } },
        });
      }
    }
  }

  // Send each successful image with a numbered caption so users know which is which
  let successCount = 0;
  let lastSourceImage: string | null = null;
  let lastSourceMimeType: string | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.ok) continue;
    const caption = toProcess.length > 1 ? `Image ${i + 1} of ${toProcess.length}` : undefined;
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
  if (successCount > 0) summaryParts.push(`✅ ${successCount} enhanced`);
  if (failureCount > 0) summaryParts.push(`⚠️ ${failureCount} failed`);
  if (skipped > 0) summaryParts.push(`⏭️ ${skipped} skipped (no credits)`);

  let footer = "\n\n💡 *Reply* to any image above to refine just that one, or type /new to start over.";
  if (session.isVerified && session.userId) {
    try {
      const balance = await getAICredits(prisma, session.userId);
      footer = `\n\n💳 Credits left: ${balance.weeklyCredits} weekly${balance.purchasedCredits > 0 ? ` + ${balance.purchasedCredits} purchased` : ""}.${footer}`;
    } catch { /* non-critical */ }
  } else {
    const fresh = await prisma.whatsAppSession.findUnique({
      where: { id: session.id },
      select: { creditsUsed: true, creditsLimit: true },
    });
    if (fresh) {
      const rem = Math.max(0, fresh.creditsLimit - fresh.creditsUsed);
      footer = `\n\n💳 Free enhancements left: ${rem}.${footer}`;
      if (rem === 0) {
        await prisma.whatsAppSession.update({ where: { id: session.id }, data: { state: STATES.EXHAUSTED } });
      }
    }
  }

  await sendWhatsAppTextMessage({
    to: from,
    body: `${summaryParts.join(" · ") || "Done"}${footer}`,
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
    // If the reply is to something that isn't one of our enhancements,
    // silently fall back to lastSource below.
  }

  if (!sourceImage || !sourceMimeType) {
    await sendWhatsAppTextMessage({
      to: from,
      body: "I don't have the previous image anymore. Send a new product photo to start fresh.",
    });
    return;
  }

  // Credit check + consume
  if (session.isVerified && session.userId) {
    try {
      await consumeWeeklyAICredit(prisma, session.userId);
    } catch (err) {
      if (err instanceof AICreditError) {
        await sendWhatsAppTextMessage({
          to: from,
          body: `⚠️ You've used all your AI credits for this week. They reset every Monday.\n\nVisit ${SIGNUP_URL} to purchase more credits.`,
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
        body: `Your 5 free enhancements are used up! 🎉\n\nSign up for 50 weekly credits:\n${SIGNUP_URL}`,
      });
      return;
    }
    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: { creditsUsed: { increment: 1 } },
    });
  }

  await sendWhatsAppTextMessage({ to: from, body: "🎨 Applying your refinement... one moment." });

  try {
    const refined = await refineProductImage(sourceImage, sourceMimeType, instruction);
    const outWamid = await sendEnhancedImage(from, refined.base64, refined.mimeType);

    // Track the refined image so the user can reply-to-refine again
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

    // Update lastSource to the refined image so a non-reply follow-up still refines the latest
    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        state: STATES.POST_ENHANCEMENT,
        lastSourceImage: refined.base64,
        lastSourceMimeType: refined.mimeType,
      },
    });

    // Balance summary
    let summary = "✅ Refinement applied.";
    if (session.isVerified && session.userId) {
      try {
        const credits = await getAICredits(prisma, session.userId);
        summary = `✅ Refinement applied. Credits remaining: ${credits.weeklyCredits} weekly${credits.purchasedCredits > 0 ? ` + ${credits.purchasedCredits} purchased` : ""}.`;
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
        summary = `✅ Refinement applied. *${remaining}* free enhancement${remaining === 1 ? "" : "s"} remaining.`;
      }
    }
    await sendWhatsAppTextMessage({ to: from, body: summary });
    await sendRefinementButtons(from);
  } catch (err) {
    console.error("WhatsApp refinement error:", err);
    // Only refund guest credits (simple counter). Verified user refunds are skipped
    // because consumeWeeklyAICredit may have drained weekly or purchased — refunding
    // the wrong bucket is worse than eating one credit on failure.
    if (!session.isVerified) {
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { creditsUsed: { decrement: 1 } },
      });
    }
    await sendWhatsAppTextMessage({
      to: from,
      body: "Sorry, I couldn't apply that refinement. Try rephrasing it, or send a new image.",
    });
  }
}

export default router;
