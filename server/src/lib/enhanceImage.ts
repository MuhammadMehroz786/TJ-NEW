import { GoogleGenAI } from "@google/genai";

/**
 * Scene presets — same catalog used by the AI Studio /enhance route. Kept in
 * this shared module so the Products "Enhance with AI" action can reuse them
 * without importing the whole router.
 */
export const backgroundScenes: Record<string, string> = {
  studio:
    "a clean pure white infinity-curve studio background with professional three-point lighting (key light, fill light, and rim light), creating soft natural shadows beneath and behind the product",
  kitchen:
    "a modern luxury kitchen countertop made of white Carrara marble, with warm ambient lighting, a subtle depth-of-field blur on stainless steel appliances and a herb plant in the far background",
  mall:
    "a premium shopping mall display shelf with elegant recessed spotlights, polished glass shelving, and a softly blurred luxury retail environment behind",
  outdoor:
    "a beautiful outdoor tabletop setting during golden hour with warm directional sunlight, a lush green garden with creamy bokeh in the background, and a natural wooden surface",
  living_room:
    "a cozy modern Scandinavian living room side table, with soft diffused natural light streaming from large windows, a neutral-toned sofa and indoor plant softly blurred behind",
  office:
    "a sleek modern office desk with clean minimalist decor, a matte white surface, soft overhead LED panel lighting, and a subtly blurred monitor and bookshelf in the background",
  nature:
    "a rustic natural setting with a light-toned wooden surface, fresh green leaves and small potted plants arranged around, with soft dappled sunlight and a shallow depth-of-field background",
  gradient:
    "a smooth seamless gradient background transitioning from soft warm white to light grey, with subtle ambient lighting from above creating a gentle shadow beneath the product",
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function detectImageMime(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

export class EnhanceError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "ENHANCE_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Sanitize a merchant-supplied theme description before it's embedded in the
// Gemini prompt. Blocks prompt-injection attempts (system: roleplay, "ignore
// previous", markdown/html injection, triple-quote break-outs) and caps length.
export function sanitizeSceneText(raw: string): string {
  let s = raw.replace(/[\r\n]+/g, " ");
  s = s.replace(/[`"']{3,}/g, "");
  s = s.replace(/<[^>]{0,120}>/g, "");
  s = s.replace(/\b(?:system|assistant|user)\s*:/gi, "");
  s = s.replace(/\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|earlier)/gi, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 300);
}

function buildPrompt(sceneName: string, sceneTextOverride?: string): string {
  // Merchant-supplied theme (sanitized) wins over the preset's canned
  // description. Empty string falls back to the preset.
  const custom = sceneTextOverride ? sanitizeSceneText(sceneTextOverride) : "";
  const sceneDescription = custom || backgroundScenes[sceneName] || backgroundScenes.studio;
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
- Add subtle reflections on glossy surfaces if the background surface would naturally produce them.

IMAGE QUALITY:
- Output a sharp, high-resolution, professional e-commerce photograph.
- Enhance clarity and detail on the product without changing its appearance.

STRICT RULES:
- Do NOT add any text, watermarks, logos, or branding.
- Do NOT add extra objects, props, or decorations that weren't specified in the background.
- Do NOT crop or change the framing — keep the product centered and properly composed.
- The result must look like an authentic photograph, not a composite or collage.`;
}

/**
 * Fetch an image from a URL (public marketplace image, e.g. Shopify/Salla CDN)
 * and return its bytes + validated mime type. Used when enhancing a synced
 * product whose only image we have is a remote https URL.
 */
export async function fetchRemoteImage(url: string): Promise<{ mimeType: string; base64: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new EnhanceError(`Couldn't download the source image (${res.status})`, 400, "SOURCE_IMAGE_FETCH_FAILED");
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (buf.length === 0) throw new EnhanceError("Source image is empty", 400, "INVALID_IMAGE");
  if (buf.length > MAX_IMAGE_BYTES) throw new EnhanceError("Source image is too large", 400, "INVALID_IMAGE");
  const mime = detectImageMime(buf);
  if (!mime) throw new EnhanceError("Source image format isn't supported", 400, "INVALID_IMAGE");
  return { mimeType: mime, base64: buf.toString("base64") };
}

/**
 * Read a /media/ relative path off local disk and return its bytes + mime. Used
 * when the product's first image is one we already hosted (e.g. from a prior
 * AI Studio enhancement).
 */
export async function readLocalMedia(relativePath: string): Promise<{ mimeType: string; base64: string }> {
  const { promises: fs } = await import("fs");
  const path = await import("path");
  const storageRoot = path.resolve(process.cwd(), "storage");
  const fullPath = path.join(storageRoot, relativePath);
  const buf = await fs.readFile(fullPath);
  if (buf.length === 0) throw new EnhanceError("Source image is empty", 400, "INVALID_IMAGE");
  if (buf.length > MAX_IMAGE_BYTES) throw new EnhanceError("Source image is too large", 400, "INVALID_IMAGE");
  const mime = detectImageMime(buf);
  if (!mime) throw new EnhanceError("Source image format isn't supported", 400, "INVALID_IMAGE");
  return { mimeType: mime, base64: buf.toString("base64") };
}

/**
 * Call Gemini to enhance an image against one of the named scene presets.
 * Returns the output bytes + mime. Caller is responsible for credit accounting
 * and persisting the result.
 */
export async function enhanceWithGemini(params: {
  inputMime: string;
  inputBase64: string;
  scene: string;
  sceneText?: string;   // free-text theme override; wins over the preset when set
}): Promise<{ mimeType: string; base64: string }> {
  if (!process.env.GEMINI_API_KEY) {
    throw new EnhanceError("GEMINI_API_KEY is not set", 500, "CONFIG_ERROR");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      { inlineData: { mimeType: params.inputMime, data: params.inputBase64 } },
      buildPrompt(params.scene, params.sceneText),
    ],
    config: { responseModalities: ["image", "text"] },
  });

  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) throw new EnhanceError("Gemini returned no content", 502, "ENHANCE_FAILED");
  const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart?.inlineData?.data) throw new EnhanceError("Gemini returned no image data", 502, "ENHANCE_FAILED");

  const rawMime = imagePart.inlineData.mimeType || "image/png";
  const allowed: Record<string, true> = { "image/png": true, "image/jpeg": true, "image/webp": true };
  const mimeType = allowed[rawMime] ? rawMime : "image/png";
  return { mimeType, base64: imagePart.inlineData.data as string };
}
