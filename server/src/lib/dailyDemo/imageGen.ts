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
- No people visible (no faces, no eyes, no shoulders, no hands)
- No Western signage, no alcohol, no neon
- Authentic real-shop or real-home Saudi feel, not a stock photo
`;

const NEGATIVE = `face, eyes, mouth, talking, multiple people, full body, studio softbox lighting, ring light, harsh rim light, overproduced commercial advertisement aesthetic, Western mall storefront, alcohol bottles, neon signs, oversaturated colors, watermarks, text overlays`;

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

function beforePrompt(niche: NicheConfig, productOverride: string): string {
  // A photo of the merchant's actual product, but shot the way a typical
  // unpolished merchant phone snap looks: poor lighting, cluttered surface,
  // mediocre composition. The same product object will be re-used in the
  // "after" scene via image-to-image conditioning.
  return (
    `A poorly-lit casual phone snapshot of ${productOverride}. ` +
    `Resting on a plain wooden surface with cluttered everyday background. ` +
    `Harsh overhead fluorescent light, unflattering shadows, mediocre amateur ` +
    `composition — the kind of photo a small merchant takes themselves before ` +
    `they know how to shoot product photos.\n${STYLE_ANCHOR}\nNEGATIVE: ${NEGATIVE}`
  );
}

function afterPrompt(productOverride: string): string {
  // Image-to-image: the reference image (the "before" output) carries the
  // exact product identity. This prompt instructs Gemini to keep the SAME
  // product but re-shoot it as a professional product photo.
  return (
    `Take the exact same product from the reference image and re-photograph it ` +
    `as a beautifully composed professional studio product shot. ` +
    `Same product: ${productOverride}. ` +
    `Background: an elegant cream marble surface with soft directional lighting, ` +
    `gentle reflections, magazine-quality product photography. ` +
    `Do NOT change the product itself — same shape, color, label, proportions, ` +
    `materials. Only the background, lighting, and composition change.\n${STYLE_ANCHOR}\nNEGATIVE: ${NEGATIVE}`
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
