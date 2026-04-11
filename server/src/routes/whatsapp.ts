import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import { AICreditError, consumeWeeklyAICredit } from "../services/aiCredits";
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
      let session = await prisma.whatsAppSession.findUnique({
        where: { phoneNumber: from },
      });

      if (!session) {
        session = await prisma.whatsAppSession.create({
          data: {
            phoneNumber: from,
            state: "awaiting_account_answer",
            lastMessageAt: now,
          },
        });
        await sendWhatsAppButtonsMessage({
          to: from,
          body: "Welcome to TijarFlow AI Assistant. Are you already registered on TijarFlow as a merchant?",
          buttons: [
            { id: "registered_yes", title: "Yes" },
            { id: "registered_no", title: "No" },
          ],
        });
        continue;
      }

      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { lastMessageAt: now },
      });

      if (session.isVerified || session.state === "verified") {
        if (message.type === "image" && message.imageId) {
          await sendWhatsAppTextMessage({
            to: from,
            body: "Enhancing your product image... please wait a moment.",
          });
          try {
            if (session.userId) {
              await consumeWeeklyAICredit(prisma, session.userId);
            }
            const media = await downloadWhatsAppMedia(message.imageId);
            const enhanced = await enhanceProductImage(media.base64, media.mimeType);
            await sendEnhancedImage(from, enhanced.base64, enhanced.mimeType);
            await sendWhatsAppTextMessage({
              to: from,
              body: "Your enhanced product image is ready! Send another image anytime.",
            });
          } catch (err: any) {
            if (err instanceof AICreditError) {
              await sendWhatsAppTextMessage({
                to: from,
                body: `You have used all your weekly AI credits. They reset every Monday. Visit ${SIGNUP_URL} to manage your account.`,
              });
            } else {
              console.error("WhatsApp verified enhancement error:", err);
              await sendWhatsAppTextMessage({
                to: from,
                body: "Sorry, we could not enhance your image right now. Please try again.",
              });
            }
          }
        } else {
          await sendWhatsAppTextMessage({
            to: from,
            body: "You are verified. Please send a product image to enhance.",
          });
        }
        continue;
      }

      if (session.state === "awaiting_account_answer" || session.state === "idle") {
        const answer = normalizeAnswer(message.text, message.interactiveReplyTitle);
        if (answer === "yes") {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: "awaiting_email", emailAttempts: 0 },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: "Please enter your registered TijarFlow merchant email.",
          });
          continue;
        }

        if (answer === "no") {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: "guest_active", creditsUsed: 0, isVerified: false, userId: null },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: "Great. You can use 5 free AI enhancements. Send your first product image now.",
          });
          continue;
        }

        await sendWhatsAppButtonsMessage({
          to: from,
          body: "Are you registered on TijarFlow as a merchant?",
          buttons: [
            { id: "registered_yes", title: "Yes" },
            { id: "registered_no", title: "No" },
          ],
        });
        continue;
      }

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
          await sendWhatsAppTextMessage({
            to: from,
            body: `Linked successfully, ${user.name}. You now have full access. Send a product image to continue.`,
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
            body: "We could not verify that email after 3 attempts. Reply hi to start again.",
          });
          continue;
        }

        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { emailAttempts: attempts },
        });
        await sendWhatsAppTextMessage({
          to: from,
          body: `Email not found for a merchant account. Attempts left: ${3 - attempts}. Please try again.`,
        });
        continue;
      }

      if (session.state === "guest_active" || session.state === "exhausted") {
        const creditsRemaining = Math.max(0, session.creditsLimit - session.creditsUsed);

        if (creditsRemaining <= 0) {
          await prisma.whatsAppSession.update({
            where: { id: session.id },
            data: { state: "exhausted" },
          });
          await sendWhatsAppTextMessage({
            to: from,
            body: `Your free credits are finished. Sign up for full access: ${SIGNUP_URL}`,
          });
          continue;
        }

        if (message.type !== "image") {
          await sendWhatsAppTextMessage({
            to: from,
            body: `You have ${creditsRemaining} free enhancement credits left. Please send a product image.`,
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
          body: "Enhancing your product image... please wait a moment.",
        });
        try {
          const media = await downloadWhatsAppMedia(message.imageId!);
          const enhanced = await enhanceProductImage(media.base64, media.mimeType);
          await sendEnhancedImage(from, enhanced.base64, enhanced.mimeType);
        } catch (err) {
          console.error("WhatsApp guest enhancement error:", err);
          await sendWhatsAppTextMessage({
            to: from,
            body: "Sorry, we could not enhance your image right now. Please try again.",
          });
        }

        const nudge =
          remainingAfter === 0
            ? `You have used your final free credit. Sign up for unlimited access: ${SIGNUP_URL}`
            : remainingAfter <= 2
              ? `Credits left: ${remainingAfter}. Upgrade anytime for unlimited access: ${SIGNUP_URL}`
              : `Credits left: ${remainingAfter}.`;
        await sendWhatsAppTextMessage({ to: from, body: nudge });
        continue;
      }
    }
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
  }
});

export default router;
