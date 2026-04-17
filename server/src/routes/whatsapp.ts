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

const router = Router();
const prisma = new PrismaClient();

const SIGNUP_URL = process.env.WHATSAPP_SIGNUP_URL || "https://tijarflow.com/signup";

const STATES = {
  AWAITING_ACCOUNT_ANSWER: "awaiting_account_answer",
  AWAITING_EMAIL: "awaiting_email",
  AWAITING_OTP: "awaiting_otp",
  AWAITING_GUEST_THEME: "awaiting_guest_theme",
  AWAITING_GUEST_IMAGE: "awaiting_guest_image",
  VERIFIED: "verified",
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

async function sendEnhancedImage(to: string, base64: string, mimeType: string): Promise<void> {
  const mediaId = await uploadWhatsAppMedia(base64, mimeType);
  await sendWhatsAppImageById({ to, mediaId });
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
      "/logout — Unlink your merchant account\n" +
      "/help — Show this menu\n\n" +
      "Send a product image anytime and I'll enhance it!",
  });
}

async function resetSessionToWelcome(sessionId: string, keepCredits: boolean, currentCreditsUsed: number): Promise<void> {
  await prisma.whatsAppSession.update({
    where: { id: sessionId },
    data: {
      state: STATES.AWAITING_ACCOUNT_ANSWER,
      userId: null,
      isVerified: false,
      emailAttempts: 0,
      otpAttempts: 0,
      pendingEmail: null,
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      pendingTheme: null,
      lastSourceImage: null,
      lastSourceMimeType: null,
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
      await resetSessionToWelcome(session.id, false, session.creditsUsed);
      await sendWelcomeMessage(from);
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

// Incoming WhatsApp events/messages
router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const messages = extractIncomingMessages(req.body);

    res.status(200).json({ ok: true });

    for (const message of messages) {
      const from = normalizePhoneNumber(message.from);
      const now = new Date();
      const answer = normalizeAnswer(message.text, message.interactiveReplyTitle);

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
            body: "✅ Send a product image and I'll enhance it with a professional studio background.\n\nType /help for commands.",
          });
        }
        continue;
      }

      if (session.state === STATES.POST_ENHANCEMENT) {
        // Stage 2: refinement loop goes here. For now, any new image or text
        // just kicks them back into the normal flow.
        if (message.type === "image" && message.imageId) {
          if (session.isVerified) {
            await handleVerifiedImageEnhancement(session, message.imageId, from);
          } else {
            await handleGuestImageEnhancement(session, message.imageId, from);
          }
        } else {
          await sendWhatsAppTextMessage({
            to: from,
            body: "Refinements coming soon! For now, send another product image to enhance, or type /help.",
          });
        }
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
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: {
              state: STATES.AWAITING_GUEST_THEME,
              creditsUsed: 0,
              creditsLimit: 5,
              isVerified: false,
              userId: null,
            },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body:
              "Great! You get *5 free AI enhancements* to try. 🎨\n\n" +
              "First, describe the *theme* or background you'd like for your product photos.\n\n" +
              "Examples: _clean white studio_, _marble kitchen counter_, _outdoor sunny park_, _minimal black background_\n\n" +
              "Send your theme as a text message.",
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

        try {
          await sendOtpEmail(email, otp);
        } catch (err) {
          console.error("Failed to send OTP email:", err);
        }

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
          body: `✅ Welcome back, ${user.name}! Your account is now linked.${creditsInfo}\n\nSend a product image to enhance it, or type /help for commands.`,
        });
        continue;
      }

      if (session.state === STATES.AWAITING_GUEST_THEME) {
        if (message.type !== "text" || !message.text) {
          await sendWhatsAppTextMessage({
            to: from,
            body: "Please describe your theme as a text message. Example: _clean white studio background_",
          });
          continue;
        }
        const theme = message.text.trim().slice(0, 500);
        if (theme.length < 3) {
          await sendWhatsAppTextMessage({ to: from, body: "Please provide a more descriptive theme (at least 3 characters)." });
          continue;
        }
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { pendingTheme: theme, state: STATES.AWAITING_GUEST_IMAGE },
        });
        await sendWhatsAppTextMessage({
          to: from,
          body: `Got it — theme saved: _${theme}_\n\nNow send your first product image! 📸 You have *${Math.max(0, session.creditsLimit - session.creditsUsed)}* free enhancements.`,
        });
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
    }
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
  }
});

async function handleVerifiedImageEnhancement(session: SessionRow, imageId: string, from: string): Promise<void> {
  await sendWhatsAppTextMessage({ to: from, body: "✨ Enhancing your product image... please wait a moment." });
  try {
    if (session.userId) {
      await consumeWeeklyAICredit(prisma, session.userId);
    }
    const media = await downloadWhatsAppMedia(imageId);
    const enhanced = await enhanceProductImage(media.base64, media.mimeType);
    await sendEnhancedImage(from, enhanced.base64, enhanced.mimeType);

    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        state: STATES.POST_ENHANCEMENT,
        lastSourceImage: media.base64,
        lastSourceMimeType: media.mimeType,
      },
    });

    let creditMsg = "✅ Done! Send another image anytime, or type /help for commands.";
    if (session.userId) {
      try {
        const credits = await getAICredits(prisma, session.userId);
        creditMsg = `✅ Done! Credits remaining: ${credits.weeklyCredits} weekly${credits.purchasedCredits > 0 ? ` + ${credits.purchasedCredits} purchased` : ""}.\n\nSend another image or type /help.`;
      } catch {
        // non-critical
      }
    }
    await sendWhatsAppTextMessage({ to: from, body: creditMsg });
  } catch (err) {
    if (err instanceof AICreditError) {
      await sendWhatsAppTextMessage({
        to: from,
        body: `⚠️ You've used all your AI credits for this week. They reset every Monday.\n\nVisit ${SIGNUP_URL} to purchase more credits.`,
      });
      return;
    }
    console.error("WhatsApp verified enhancement error:", err);
    await sendWhatsAppTextMessage({ to: from, body: "Sorry, we could not enhance your image right now. Please try again." });
  }
}

async function handleGuestImageEnhancement(session: SessionRow, imageId: string, from: string): Promise<void> {
  const updated = await prisma.whatsAppSession.update({
    where: { id: session.id },
    data: { creditsUsed: { increment: 1 } },
    select: { creditsUsed: true, creditsLimit: true, pendingTheme: true },
  });
  const remainingAfter = Math.max(0, updated.creditsLimit - updated.creditsUsed);
  const exhausted = remainingAfter <= 0;
  const theme = updated.pendingTheme || STUDIO_SCENE;

  await sendWhatsAppTextMessage({ to: from, body: "✨ Enhancing your product image... please wait a moment." });

  try {
    const media = await downloadWhatsAppMedia(imageId);
    const enhanced = await enhanceProductImage(media.base64, media.mimeType, theme);
    await sendEnhancedImage(from, enhanced.base64, enhanced.mimeType);

    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        state: exhausted ? STATES.EXHAUSTED : STATES.POST_ENHANCEMENT,
        lastSourceImage: media.base64,
        lastSourceMimeType: media.mimeType,
      },
    });

    let message = `✅ Done! Credits remaining: *${remainingAfter}*. Send another image or type /help.`;
    if (remainingAfter === 0) {
      message = `✅ Done! That was your last free enhancement.\n\nSign up for unlimited weekly credits:\n${SIGNUP_URL}\n\nAlready have an account? Type /start.`;
    } else if (remainingAfter <= 2) {
      message = `✅ Done! You have *${remainingAfter}* free enhancement${remainingAfter === 1 ? "" : "s"} left.\n\nUpgrade: ${SIGNUP_URL}`;
    }
    await sendWhatsAppTextMessage({ to: from, body: message });
  } catch (err) {
    console.error("WhatsApp guest enhancement error:", err);
    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: { creditsUsed: { decrement: 1 }, state: STATES.AWAITING_GUEST_IMAGE },
    });
    await sendWhatsAppTextMessage({ to: from, body: "Sorry, we could not enhance your image right now. Please try again." });
  }
}

export default router;
