// Short-Form Content Agent — shared schemas + types.
// Single source of truth: imported by the server (`server/src/...`) for
// request validation and by the client (`client/src/...`) for form gating.
// Relative imports keep things simple — both workspaces resolve this path.
import { z } from "zod";

export const TONES = [
  "playful",
  "professional",
  "urgent",
  "inspirational",
  "educational",
] as const;
export const GOALS = ["awareness", "conversion", "engagement"] as const;
export const LANGUAGES = ["ar", "en"] as const;
export const PLATFORMS = ["tiktok", "reels", "shorts"] as const;

export type Tone = (typeof TONES)[number];
export type Goal = (typeof GOALS)[number];
export type Language = (typeof LANGUAGES)[number];
export type Platform = (typeof PLATFORMS)[number];

// What the admin submits.
export const GenerateInputSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  tone: z.enum(TONES),
  goal: z.enum(GOALS),
  language: z.enum(LANGUAGES),
  platforms: z
    .array(z.enum(PLATFORMS))
    .min(1)
    .max(PLATFORMS.length)
    .refine((arr) => new Set(arr).size === arr.length, "platforms must be unique"),
  parentId: z.string().uuid().optional(),
});
export type GenerateInput = z.infer<typeof GenerateInputSchema>;

// Shape Gemini must return — kept in sync with geminiResponseSchema in
// server/src/lib/contentAgent/prompt.ts. The Zod schema here is the
// belt-and-braces check after Gemini responds.
export const StoryboardSceneSchema = z.object({
  scene: z.number().int().min(1),
  timecode: z.string().min(1),
  shot: z.string().min(1),
});
export const PlatformCaptionSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(0).max(20),
});
// Captions: optional per platform. The cross-check in
// validateOutputAgainstInput() enforces that every requested platform IS
// present; this schema accepts any subset so Gemini omitting one platform
// surfaces as a clear cross-check failure (with platform name), not a
// generic zod "required" complaint.
const CaptionsSchema = z.object({
  tiktok: PlatformCaptionSchema.optional(),
  reels: PlatformCaptionSchema.optional(),
  shorts: PlatformCaptionSchema.optional(),
});
export const GenerationOutputSchema = z.object({
  hooks: z.array(z.string().min(1)).min(1).max(3),
  script: z.string().min(1),
  storyboard: z.array(StoryboardSceneSchema).min(1).max(12),
  captions: CaptionsSchema,
});
export type GenerationOutput = z.infer<typeof GenerationOutputSchema>;

// Cross-check that Gemini returned a caption entry for every platform the
// admin requested. Schema can't express "subset of these keys equal to
// platforms[]" cleanly, so this is a separate refinement.
export function validateOutputAgainstInput(
  input: GenerateInput,
  output: GenerationOutput,
): { ok: true } | { ok: false; reason: string } {
  for (const p of input.platforms) {
    if (!output.captions[p]) {
      return { ok: false, reason: `missing captions for ${p}` };
    }
  }
  return { ok: true };
}

// History pagination + filters.
export const HistoryQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  language: z.enum(LANGUAGES).optional(),
  platform: z.enum(PLATFORMS).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["ok", "failed"]).default("ok"),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
