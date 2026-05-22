import { GoogleGenAI } from "@google/genai";
import { promises as fs } from "fs";
import path from "path";
import { NicheConfig } from "./niches";

/**
 * Image generation for the Daily Demo Video using Nano Banana 2
 * (Gemini 2.5 Flash Image). Generates the 3 scenes (shop / before / after)
 * in parallel and writes them to disk under storage/daily-videos/<id>/.
 *
 * Style anchor is appended to every scene prompt so all 3 frames feel like
 * the same brand video — no studio lighting, warm Saudi aesthetic, 9:16.
 *
 * Verified against the live API in the test session on 2026-05-22: 4 scenes
 * in ~15s parallel for ~$0.16. The 3-scene daily video runs in ~10s for ~$0.12.
 */

// ── Global style anchor (identical across all 3 scenes) ──────────────────────
const STYLE_ANCHOR = `
STYLE RULES (apply exactly):
- Vertical 9:16 portrait composition
- Warm Saudi/MENA aesthetic, golden hour natural daylight from window on left
- Documentary photography style, soft natural shadows, NOT a studio product shoot
- Color palette: warm earth tones, soft golds, deep browns, cream, not over-saturated
- No people visible (no faces, no eyes, no shoulders, no hands except where specifically requested)
- No Western signage, no alcohol, no neon, no commercial polish that screams "agency ad"
- Authentic real-shop or real-home Saudi feel, not a stock photo
`;

const NEGATIVE = `face, eyes, mouth, talking, multiple people, full body, studio softbox lighting, ring light, harsh rim light, overproduced commercial advertisement aesthetic, Western mall storefront, alcohol bottles, neon signs, oversaturated colors, watermarks, text overlays`;

export type SceneKind = "shop" | "before" | "after";

interface SceneSpec {
  kind: SceneKind;
  prompt: string;
}

export function buildScenes(niche: NicheConfig): SceneSpec[] {
  return [
    { kind: "shop", prompt: `${niche.shopPrompt}\n${STYLE_ANCHOR}\nNEGATIVE: ${NEGATIVE}` },
    {
      // The "before" frame shows the bad phone photo. We frame it as a phone
      // screen mock so the eventual zoom-in feels like the merchant looking at
      // their own product photo in disgust.
      kind: "before",
      prompt:
        `A close-up of a smartphone screen displayed on a dark walnut wooden table. ` +
        `The screen shows: ${niche.beforePrompt}. ` +
        `The phone is centered, the screen content is the focal point. ` +
        `Around the phone on the table: a brass Arabic coffee finjan, a small dish of Medjool dates.\n${STYLE_ANCHOR}\nNEGATIVE: ${NEGATIVE}`,
    },
    {
      // The "after" frame shows the enhanced photo on the same phone, same
      // table setting — visual continuity between scene 2 and scene 3 is the
      // whole point. Same phone, same table, different image on screen.
      kind: "after",
      prompt:
        `A close-up of the same smartphone screen on the same dark walnut wooden table as before. ` +
        `The screen now shows: ${niche.afterPrompt}. ` +
        `The phone is centered, the screen content is the focal point. ` +
        `Same brass Arabic coffee finjan and small dish of Medjool dates on the table.\n${STYLE_ANCHOR}\nNEGATIVE: ${NEGATIVE}`,
    },
  ];
}

export class ImageGenError extends Error {
  constructor(message: string) {
    super(`[dailyDemo:imageGen] ${message}`);
    this.name = "ImageGenError";
  }
}

interface GenerateOneResult {
  kind: SceneKind;
  relativePath: string;
  bytes: number;
  ms: number;
}

/**
 * Generate one image and write it to disk. Returns the relative path so the
 * caller can store it on the DailyDemoVideo row.
 */
async function generateOne(params: {
  ai: GoogleGenAI;
  scene: SceneSpec;
  outDir: string;
  storageRoot: string;
}): Promise<GenerateOneResult> {
  const { ai, scene, outDir, storageRoot } = params;
  const t0 = Date.now();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: scene.prompt }] }],
    config: {
      responseModalities: ["IMAGE"],
      // Aspect ratio is enforced via imageConfig on the new SDK — Gemini
      // sometimes still drifts, but ffmpeg's scale/crop later normalizes.
      imageConfig: { aspectRatio: "9:16" },
    } as Record<string, unknown>,
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => (p as { inlineData?: { data?: string } }).inlineData?.data);
  if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData?.data) {
    const textPart = parts.find((p) => (p as { text?: string }).text);
    const reason = (textPart as { text?: string } | undefined)?.text?.slice(0, 200) ?? "(no text)";
    throw new ImageGenError(`scene=${scene.kind} returned no image. reason=${reason}`);
  }

  const buf = Buffer.from(imagePart.inlineData.data, "base64");
  const fileName = `${scene.kind}.png`;
  const absPath = path.join(storageRoot, outDir, fileName);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);
  return {
    kind: scene.kind,
    relativePath: path.join(outDir, fileName).replaceAll("\\", "/"),
    bytes: buf.length,
    ms: Date.now() - t0,
  };
}

/**
 * Generate all 3 scenes in parallel. Returns the relative paths in scene
 * order (shop, before, after) so the caller doesn't need to sort.
 */
export async function generateSceneImages(params: {
  niche: NicheConfig;
  jobId: string;
  storageRoot: string;
}): Promise<{ shop: string; before: string; after: string; totalMs: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ImageGenError("GEMINI_API_KEY not set");
  const ai = new GoogleGenAI({ apiKey });

  const scenes = buildScenes(params.niche);
  const outDir = path.join("daily-videos", params.jobId).replaceAll("\\", "/");

  const t0 = Date.now();
  const results = await Promise.all(
    scenes.map((scene) =>
      generateOne({ ai, scene, outDir, storageRoot: params.storageRoot }),
    ),
  );
  const totalMs = Date.now() - t0;

  // Sort back to canonical order — Promise.all preserves order, but be explicit
  // so future refactors that introduce concurrency limits don't break this.
  const byKind = (k: SceneKind) => results.find((r) => r.kind === k)!.relativePath;
  return {
    shop: byKind("shop"),
    before: byKind("before"),
    after: byKind("after"),
    totalMs,
  };
}
