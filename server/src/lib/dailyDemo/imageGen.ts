import { GoogleGenAI } from "@google/genai";
import { promises as fs } from "fs";
import path from "path";
import { NicheConfig } from "./niches";

/**
 * Image generation for the Daily Demo Video using Nano Banana 2
 * (Gemini 2.5 Flash Image). Writes 3 scenes (shop / before / after) to disk
 * under storage/daily-videos/<id>/.
 *
 * Two generation passes:
 *   1) shop + before  → text-to-image, parallel (independent prompts)
 *   2) after          → image-to-image using BEFORE as the reference, so the
 *      product is the SAME object, only the background/lighting/composition
 *      changes. Without this chaining, scene 2 and scene 3 show two different
 *      products, which breaks the entire "before/after" premise of the video.
 *
 * Scenes 2 + 3 are framed as direct product shots (NOT a phone-screen mock).
 * Earlier versions wrapped them in "smartphone showing the TijarFlow app",
 * which forced Gemini to invent a fake UI it had never seen. Cleaner to just
 * show the product transformation directly.
 *
 * The optional `productOverride` param replaces the niche default product
 * description in scenes 2+3 — lets the admin target a specific merchant type
 * (e.g. niche=oud, productOverride="premium Cambodian oud chips in a wooden
 * box"). Captions / voiceover use the niche defaults regardless.
 */

const STYLE_ANCHOR = `
STYLE RULES (apply exactly):
- Vertical 9:16 portrait composition
- Warm Saudi/MENA aesthetic, natural daylight from window on left
- Documentary photography style, soft natural shadows
- Color palette: warm earth tones, soft golds, deep browns, cream, not over-saturated
- Faceless: hands and forearms are welcome but NO faces, NO eyes, NO shoulders, NO bodies above the wrists
- No Western signage, no alcohol, no neon
- Authentic real-shop or real-home Saudi feel, not a stock photo
`;

const NEGATIVE = `face, eyes, mouth, talking, multiple people, full body, body above wrists, studio softbox lighting, ring light, harsh rim light, overproduced commercial advertisement aesthetic, Western mall storefront, alcohol bottles, neon signs, oversaturated colors, watermarks, text overlays`;

export type SceneKind = "shop" | "before" | "after";

export class ImageGenError extends Error {
  constructor(message: string) {
    super(`[dailyDemo:imageGen] ${message}`);
    this.name = "ImageGenError";
  }
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function shopPrompt(niche: NicheConfig): string {
  return `${niche.shopPrompt}\n${STYLE_ANCHOR}\nNEGATIVE: ${NEGATIVE}`;
}

function beforePrompt(_niche: NicheConfig, productOverride: string): string {
  // The merchant POV: hands holding a smartphone in a Saudi majlis, taking a
  // casual snapshot of their actual product sitting on a wooden table. The
  // phone screen shows the product photo (poorly lit / amateur composition).
  // The same hands, phone, and majlis setting are re-used in the "after"
  // scene via image-to-image so the only thing that changes is what's on
  // the phone screen.
  return (
    `A close-up overhead point-of-view photograph: a Saudi person's hands holding ` +
    `a smartphone in a traditional Riyadh majlis home. The smartphone is LARGE and ` +
    `dominant in the frame, held centered, filling roughly the middle 55% of the ` +
    `vertical composition so its screen is big and perfectly legible. The hands are ` +
    `framing a casual quick snapshot of ${productOverride}, which sits on a dark ` +
    `walnut wooden table directly beneath the phone. The phone screen clearly and ` +
    `sharply shows the photo being taken — a poorly lit, unflattering, AMATEUR ` +
    `snapshot of ${productOverride}: dull flat lighting, harsh ugly shadows, cluttered ` +
    `messy background, crooked mediocre composition, slightly blurry. The on-screen ` +
    `amateur photo is the clear focal point. Around the table: a brass Arabic coffee ` +
    `finjan, a small dish of Medjool dates, beige majlis cushions softly blurred in ` +
    `the background. Soft warm afternoon daylight from a window on the left. Hands ` +
    `and forearms visible only — NO face, NO body above wrists.\n${STYLE_ANCHOR}\nNEGATIVE: ${NEGATIVE}`
  );
}

function afterPrompt(productOverride: string): string {
  // Image-to-image off the "before" output. Same hands, same phone, same
  // majlis, same product — the only thing that changes is the photo shown
  // on the phone screen: it becomes a professional studio-quality shot of
  // the same product. This is the visual punchline of the whole video.
  return (
    `EDIT THE REFERENCE IMAGE. This is a precise before/after edit, NOT a new scene. ` +
    `Reproduce the reference image EXACTLY — identical hands, identical smartphone, ` +
    `identical phone position and size, identical Saudi majlis, identical wooden ` +
    `table, identical brass finjan and dates, identical background, identical camera ` +
    `angle and lighting. Do NOT restyle, re-light, or re-compose the room or the ` +
    `physical scene in any way.\n\n` +
    `THE ONE AND ONLY CHANGE — replace the photo displayed ON THE PHONE SCREEN. ` +
    `The reference screen shows an amateur snapshot of ${productOverride}; in the ` +
    `output the very same phone screen must instead display a STUNNING professional ` +
    `studio product photograph of the same ${productOverride}: clean seamless ` +
    `gradient studio backdrop, crisp tack-sharp focus, flattering soft-box ` +
    `lighting with elegant highlights and gentle reflections, rich saturated ` +
    `color, premium e-commerce hero-shot composition, the product centered and ` +
    `hero-lit. The transformation on the screen must be OBVIOUS and dramatic — ` +
    `clearly amateur-phone-photo turning into magazine-quality studio photo. ` +
    `Everything outside the phone screen stays pixel-for-pixel the same.\n${STYLE_ANCHOR}\nNEGATIVE: ${NEGATIVE}`
  );
}

// ── Single-image generation ──────────────────────────────────────────────────

interface GenerateOneResult {
  kind: SceneKind;
  relativePath: string;
  bytes: number;
  ms: number;
}

interface GenerateOneParams {
  ai: GoogleGenAI;
  kind: SceneKind;
  prompt: string;
  outDir: string;
  storageRoot: string;
  // For image-to-image: pass the reference image as inline base64 + mime.
  // Omit for text-to-image scenes.
  referenceImage?: { base64: string; mimeType: string };
}

async function generateOne(params: GenerateOneParams): Promise<GenerateOneResult> {
  const { ai, kind, prompt, outDir, storageRoot, referenceImage } = params;
  const t0 = Date.now();

  // Contents: when a reference image is provided, prepend it to the parts so
  // Gemini treats it as the visual seed for the generation.
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (referenceImage) {
    parts.push({ inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } });
  }
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "9:16" },
    } as Record<string, unknown>,
  });

  const respParts = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = respParts.find(
    (p) => (p as { inlineData?: { data?: string } }).inlineData?.data,
  );
  if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData?.data) {
    const textPart = respParts.find((p) => (p as { text?: string }).text);
    const reason = (textPart as { text?: string } | undefined)?.text?.slice(0, 200) ?? "(no text)";
    throw new ImageGenError(`scene=${kind} returned no image. reason=${reason}`);
  }

  const buf = Buffer.from(imagePart.inlineData.data, "base64");
  const fileName = `${kind}.png`;
  const absPath = path.join(storageRoot, outDir, fileName);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);
  return {
    kind,
    relativePath: path.join(outDir, fileName).replaceAll("\\", "/"),
    bytes: buf.length,
    ms: Date.now() - t0,
  };
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function generateSceneImages(params: {
  niche: NicheConfig;
  productOverride: string;
  jobId: string;
  storageRoot: string;
}): Promise<{ shop: string; before: string; after: string; totalMs: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ImageGenError("GEMINI_API_KEY not set");
  const ai = new GoogleGenAI({ apiKey });

  const outDir = path.join("daily-videos", params.jobId).replaceAll("\\", "/");
  const t0 = Date.now();

  // Pass 1: shop + before in parallel (independent).
  const [shopResult, beforeResult] = await Promise.all([
    generateOne({
      ai,
      kind: "shop",
      prompt: shopPrompt(params.niche),
      outDir,
      storageRoot: params.storageRoot,
    }),
    generateOne({
      ai,
      kind: "before",
      prompt: beforePrompt(params.niche, params.productOverride),
      outDir,
      storageRoot: params.storageRoot,
    }),
  ]);

  // Pass 2: read the just-written before.png and use it as the reference for
  // the after scene. This is what enforces product identity continuity — the
  // model rebuilds the exact same product object in a new setting instead of
  // inventing a fresh one.
  const beforeAbsPath = path.join(params.storageRoot, beforeResult.relativePath);
  const beforeBytes = await fs.readFile(beforeAbsPath);
  const afterResult = await generateOne({
    ai,
    kind: "after",
    prompt: afterPrompt(params.productOverride),
    outDir,
    storageRoot: params.storageRoot,
    referenceImage: { base64: beforeBytes.toString("base64"), mimeType: "image/png" },
  });

  return {
    shop: shopResult.relativePath,
    before: beforeResult.relativePath,
    after: afterResult.relativePath,
    totalMs: Date.now() - t0,
  };
}
