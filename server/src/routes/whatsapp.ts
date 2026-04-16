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

const router = Router();
const prisma = new PrismaClient();

const SIGNUP_URL = process.env.WHATSAPP_SIGNUP_URL || "https://tijarflow.com/signup";

function normalizeAnswer(content: string | undefined, interactiveTitle: string | undefined): string {
  return String(interactiveTitle || content || "").trim().toLowerCase();
}

/** Returns true if the user is trying to restart the conversation */
function isRestartTrigger(answer: string): boolean {
  return ["hi", "hello", "start", "restart", "menu", "help", "مرحبا", "أهلا"].includes(answer);
}

const STUDIO_SCENE =
  "a clean pure white infinity-curve studio background with professional three-point lighting (key light, fill light, and rim light), creating soft natural shadows beneath and behind the product";

async function enhanceProductImage(
  base64: string,
  mimeType: string,
): Promise<{ base64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You are a professional e-commerce product photographer. Edit this product image following these strict rules:

PRODUCT PRESERVATION (most important):
- Keep the product EXACTLY as it is — same shape, size, proportions, colors, textures, labels, and details.
- Do NOT alter, regenerate, distort, or artistically reinterpret the product in any way.
- Maintain the product's original scale and perspective angle.

BACKGROUND REPLACEMENT:
- Completely remove the existing background.
- Replace it with: ${STUDIO_SCENE}.
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

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ inlineData: { mimeType, data: base64 } }, prompt],
    config: { responseModalities: ["image", "text"] },
  });

  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) throw new Error("No response parts returned.");
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

    // Acknowledge webhook quickly
    res.status(200).json({ ok: true });

    for (const message of messages) {
      const from = normalizePhoneNumber(message.from);
      const now = new Date();
      const answer = normalizeAnswer(message.text, message.interactiveReplyTitle);

      let session = await prisma.whatsAppSession.findUnique({
        where: { phoneNumber: from },
      });

      // Brand-new user
      if (!session) {
        session = await prisma.whatsAppSession.create({
          data: {
            phoneNumber: from,
            state: "awaiting_account_answer",
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

      // --- Global restart trigger (except verified users — they have a working session) ---
      if (
        !session.isVerified &&
        session.state !== "verified" &&
        isRestartTrigger(answer)
      ) {
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: {
            state: "awaiting_account_answer",
            emailAttempts: 0,
            creditsUsed: session.isVerified ? session.creditsUsed : 0,
          },
        });
        await sendWelcomeMessage(from);
        continue;
      }

      // --- Verified / linked merchant ---
      if (session.isVerified || session.state === "verified") {
        if (message.type === "image" && message.imageId) {
          await sendWhatsAppTextMessage({
            to: from,
            body: "✨ Enhancing your product image... please wait a moment.",
          });
          try {
            if (session.userId) {
              await consumeWeeklyAICredit(prisma, session.userId);
            }
            const media = await downloadWhatsAppMedia(message.imageId);
            const enhanced = await enhanceProductImage(media.base64, media.mimeType);
            await sendEnhancedImage(from, enhanced.base64, enhanced.mimeType);

            // Show remaining credits after enhancement
            let creditMsg = "Your enhanced product image is ready! Send another image anytime.";
            if (session.userId) {
              try {
                const credits = await getAICredits(prisma, session.userId);
                creditMsg = `✅ Done! Credits remaining this week: ${credits.weeklyCredits}${credits.purchasedCredits > 0 ? ` + ${credits.purchasedCredits} purchased` : ""}. Send another image anytime.`;
              } catch {
                // non-critical, use default message
              }
            }
            await sendWhatsAppTextMessage({ to: from, body: creditMsg });
          } catch (err: any) {
            if (err instanceof AICreditError) {
              await sendWhatsAppTextMessage({
                to: from,
                body: `⚠️ You've used all your AI credits for this week. They reset every Monday.\n\nVisit ${SIGNUP_URL} to purchase more credits.`,
              });
            } else {
              console.error("WhatsApp verified enhancement error:", err);
              await sendWhatsAppTextMessage({
                to: from,
                body: "Sorry, we could not enhance your image right now. Please try again.",
              });
            }
          }
        } else if (answer === "credits" || answer === "balance") {
          if (session.userId) {
            try {
              const credits = await getAICredits(prisma, session.userId);
              await sendWhatsAppTextMessage({
                to: from,
                body: `💳 Your credit balance:\n• Weekly credits: ${credits.weeklyCredits} (resets Monday)\n• Purchased credits: ${credits.purchasedCredits}\n• Total: ${credits.totalCredits}\n\nSend a product image to use them!`,
              });
            } catch {
              await sendWhatsAppTextMessage({ to: from, body: "Could not fetch your credit balance. Please try again." });
            }
          }
        } else {
          await sendWhatsAppTextMessage({
            to: from,
            body: "✅ You're verified and ready to go!\n\nSend a product image and we'll give it a professional studio background.\n\nType *credits* to check your balance.",
          });
        }
        continue;
      }

      // --- Awaiting yes/no: are you a registered merchant? ---
      if (session.state === "awaiting_account_answer" || session.state === "idle") {
        if (answer === "yes" || answer === "yes, i'm registered") {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: "awaiting_email", emailAttempts: 0 },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: "Please enter the email address you used to register on TijarFlow.",
          });
          continue;
        }

        if (answer === "no" || answer === "no, use free trial") {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: "guest_active", creditsUsed: 0, creditsLimit: 5, isVerified: false, userId: null },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: "Great! You have *5 free AI enhancements* to try.\n\nSend your first product image now and we'll give it a professional studio background! 🎨",
          });
          continue;
        }

        // Unclear input — re-send buttons
        await sendWelcomeMessage(from);
        continue;
      }

      // --- Awaiting email verification ---
      if (session.state === "awaiting_email") {
        if (message.type !== "text" || !message.text) {
          await sendWhatsAppTextMessage({
            to: from,
            body: "Please type your registered TijarFlow merchant email address.",
          });
          continue;
        }

        const email = message.text.trim().toLowerCase();
        const user = await prisma.user.findFirst({
          where: { email, role: "MERCHANT" },
          select: { id: true, name: true },
        });

        if (user) {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { userId: user.id, isVerified: true, state: "verified", emailAttempts: 0 },
          });

          let creditsInfo = "";
          try {
            const credits = await getAICredits(prisma, user.id);
            creditsInfo = `\n\n💳 Credits this week: ${credits.weeklyCredits}${credits.purchasedCredits > 0 ? ` + ${credits.purchasedCredits} purchased` : ""}.`;
          } catch {
            // non-critical
          }

          await sendWhatsAppTextMessage({
            to: from,
            body: `✅ Welcome back, ${user.name}! Your account is now linked.${creditsInfo}\n\nSend a product image to enhance it!`,
          });
          continue;
        }

        const attempts = session.emailAttempts + 1;
        if (attempts >= 3) {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: "idle", emailAttempts: 0 },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: "We could not find a merchant account with that email after 3 attempts.\n\nReply *hi* to start over or visit " + SIGNUP_URL + " to create an account.",
          });
          continue;
        }

        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { emailAttempts: attempts },
        });
        await sendWhatsAppTextMessage({
          to: from,
          body: `❌ No merchant account found for that email. ${3 - attempts} attempt${3 - attempts === 1 ? "" : "s"} remaining.\n\nPlease try a different email address.`,
        });
        continue;
      }

      // --- Guest: active or exhausted ---
      if (session.state === "guest_active" || session.state === "exhausted") {
        // Allow exhausted/guest users to link a merchant account
        if (answer === "register" || answer === "link" || answer === "login" || answer === "yes, i'm registered") {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: "awaiting_email", emailAttempts: 0 },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: "Please enter the email address you used to register on TijarFlow.",
          });
          continue;
        }

        const creditsRemaining = Math.max(0, session.creditsLimit - session.creditsUsed);

        if (creditsRemaining <= 0) {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: "exhausted" },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: `Your 5 free enhancements are used up! 🎉\n\nSign up for TijarFlow to get 50 AI credits every week:\n${SIGNUP_URL}\n\nAlready have an account? Reply *register* to link it.`,
          });
          continue;
        }

        if (message.type !== "image") {
          await sendWhatsAppTextMessage({
            to: from,
            body: `You have *${creditsRemaining}* free enhancement${creditsRemaining === 1 ? "" : "s"} remaining.\n\nSend a product image to use one! 📸\n\nAlready on TijarFlow? Reply *register* to link your account and get 50 weekly credits.`,
          });
          continue;
        }

        const updated = await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { creditsUsed: { increment: 1 } },
          select: { creditsUsed: true, creditsLimit: true },
        });
        const remainingAfter = Math.max(0, updated.creditsLimit - updated.creditsUsed);
        const exhausted = remainingAfter <= 0;
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { state: exhausted ? "exhausted" : "guest_active" },
        });

        await sendWhatsAppTextMessage({
          to: from,
          body: "✨ Enhancing your product image... please wait a moment.",
        });

        let enhancementOk = false;
        try {
          const media = await downloadWhatsAppMedia(message.imageId!);
          const enhanced = await enhanceProductImage(media.base64, media.mimeType);
          await sendEnhancedImage(from, enhanced.base64, enhanced.mimeType);
          enhancementOk = true;
        } catch (err) {
          console.error("WhatsApp guest enhancement error:", err);
          // Refund the credit on failure
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { creditsUsed: { decrement: 1 }, state: "guest_active" },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: "Sorry, we could not enhance your image right now. Please try again.",
          });
          continue;
        }

        if (enhancementOk) {
          if (remainingAfter === 0) {
            await sendWhatsAppTextMessage({
              to: from,
              body: `✅ Done! That was your last free enhancement.\n\nSign up for unlimited weekly credits:\n${SIGNUP_URL}\n\nAlready have an account? Reply *register* to link it.`,
            });
          } else if (remainingAfter <= 2) {
            await sendWhatsAppTextMessage({
              to: from,
              body: `✅ Done! You have *${remainingAfter}* free enhancement${remainingAfter === 1 ? "" : "s"} left.\n\nUpgrade anytime: ${SIGNUP_URL}`,
            });
          } else {
            await sendWhatsAppTextMessage({
              to: from,
              body: `✅ Done! Credits remaining: *${remainingAfter}*. Send another image anytime!`,
            });
          }
        }
        continue;
      }
    }
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
  }
});

export default router;
