import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

/**
 * ffmpeg orchestration for the Daily Demo Video.
 *
 * Input: 3 still PNGs (shop, before, after) + 1 voiceover MP3 + per-scene
 * Arabic captions. Output: one 9:16 vertical MP4 with Ken Burns motion on
 * each image, crossfades between scenes, captions overlaid, voiceover mixed
 * over soft background music (optional), and a CTA end card.
 *
 * Why so many ffmpeg steps:
 *   1. Each scene is rendered as its own 5s mp4 first (clean Ken Burns per
 *      scene with the caption baked in). Doing it in one giant filter_complex
 *      is possible but the syntax becomes unmaintainable.
 *   2. The 4 mp4s (3 scenes + 1 end card) are concatenated with crossfades.
 *   3. The voiceover is mixed in as the final pass.
 *
 * Each step shells out to ffmpeg via spawn(); stdout/stderr are captured for
 * debugging when something blows up.
 *
 * Verified Arabic text shaping works because the VPS ffmpeg is built with
 * libfribidi + libharfbuzz (checked 2026-05-22).
 */

const ARABIC_FONT = "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf";
const LOGO_PATH = path.join(__dirname, "assets", "logo-dark.png");
const LATIN_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const VIDEO_W = 1080;
const VIDEO_H = 1920;
const FPS = 25;
const SCENE_DURATION_SEC = 5;        // 3 scenes × 5s = 15s body
const END_CARD_MIN_SEC = 3;          // minimum CTA hold time
const END_CARD_TAIL_PAD_SEC = 0.8;   // small silence buffer after voiceover ends
const CROSSFADE_SEC = 0.5;
const TIJARFLOW_BRAND = "www.tijarflow.com";

export class RenderError extends Error {
  constructor(message: string) {
    super(`[dailyDemo:render] ${message}`);
    this.name = "RenderError";
  }
}

interface SceneInput {
  imagePath: string;       // absolute
  captionAr: string;
  zoom: "in" | "out";      // ken burns direction
}

interface RenderParams {
  storageRoot: string;
  jobId: string;
  shopAbsPath: string;
  beforeAbsPath: string;
  afterAbsPath: string;
  voiceoverAbsPath: string;
  captions: {
    shop: string;     // e.g. "هل أنت بائع ذهب؟"
    before: string;   // e.g. "هذي صورة منتجك"
    after: string;    // e.g. "خلال ٣٠ ثانية، صارت احترافية"
    cta: string;      // e.g. "جرّب تيجار فلو اليوم"
  };
}

interface RenderResult {
  videoRelativePath: string;
  thumbnailRelativePath: string;
  renderMs: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeDrawtext(text: string): string {
  // ffmpeg drawtext escape rules: backslash for ': % \, then single-quote
  // wrapping handles the rest. Arabic content survives without further escaping.
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/%/g, "\\%").replace(/'/g, "’");
}

// Probe a media file's duration in seconds using ffprobe. Used to size the
// end-card hold so the video extends to cover the voiceover instead of getting
// cut mid-sentence by ffmpeg's -shortest behavior.
function probeDuration(absPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      absPath,
    ]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => { stdout += c.toString(); });
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("error", (err) => reject(new RenderError(`ffprobe spawn failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new RenderError(`ffprobe exit ${code}: ${stderr.slice(0, 300)}`));
      const n = parseFloat(stdout.trim());
      if (!Number.isFinite(n)) return reject(new RenderError(`ffprobe non-numeric duration: ${stdout}`));
      resolve(n);
    });
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(new RenderError(`spawn failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new RenderError(`ffmpeg exit ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

// ── Single scene render with Ken Burns + caption ─────────────────────────────

async function renderScene(scene: SceneInput, outPath: string): Promise<void> {
  // Ken Burns approach: scale image up to 2x then use zoompan to slowly zoom in
  // or out over the scene duration. The image is held centered.
  // For zoom IN: zoom goes 1.0 → 1.25 across the scene.
  // For zoom OUT: zoom goes 1.25 → 1.0.
  const totalFrames = SCENE_DURATION_SEC * FPS;
  const zoomExpr =
    scene.zoom === "in"
      ? `'min(1.0+0.25*on/${totalFrames},1.25)'`
      : `'max(1.25-0.25*on/${totalFrames},1.0)'`;

  // Caption: bottom-positioned, semi-transparent black box behind for readability.
  // text_shaping=1 is required for proper Arabic letter joining (cursive).
  //
  // Multi-line: ffmpeg drawtext doesn't auto-wrap, so callers can pass a "|"
  // anywhere in captionAr to force a line break (rendered as stacked drawtext
  // filters). Each line gets the same box treatment; lines are centered and
  // stacked from the bottom up so the lowest line sits at the same baseline
  // as a single-line caption would.
  const FONT_SIZE = 56;            // shrunk from 64pt — fits scene-3 caption
  const LINE_HEIGHT = FONT_SIZE + 24;
  const lines = scene.captionAr.split("|").map((s) => s.trim()).filter(Boolean);
  const drawtext = lines
    .map((line, idx) => {
      const lineFromBottom = lines.length - 1 - idx;
      const yExpr = `h-text_h-160-${lineFromBottom * LINE_HEIGHT}`;
      return (
        `drawtext=fontfile=${ARABIC_FONT}` +
        `:text='${escapeDrawtext(line)}'` +
        `:fontsize=${FONT_SIZE}:fontcolor=white` +
        `:borderw=4:bordercolor=black@0.85` +
        `:box=1:boxcolor=black@0.55:boxborderw=18` +
        `:x=(w-text_w)/2:y=${yExpr}` +
        `:text_shaping=1` +
        `:enable='between(t,0.3,${SCENE_DURATION_SEC - 0.2})'`
      );
    })
    .join(",");

  const vf =
    `scale=${VIDEO_W * 2}:${VIDEO_H * 2}:force_original_aspect_ratio=increase,` +
    `crop=${VIDEO_W * 2}:${VIDEO_H * 2},` +
    `zoompan=z=${zoomExpr}:d=${totalFrames}` +
    `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
    `:s=${VIDEO_W}x${VIDEO_H}:fps=${FPS},` +
    drawtext;

  await runFfmpeg([
    "-loop", "1",
    "-i", scene.imagePath,
    "-t", String(SCENE_DURATION_SEC),
    "-vf", vf,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "20",
    "-r", String(FPS),
    outPath,
  ]);
}

// ── CTA end card ─────────────────────────────────────────────────────────────

async function renderEndCard(captionAr: string, outPath: string, durationSec: number): Promise<void> {
  // Solid TijarFlow brand color background with the TijarFlow logo, an Arabic
  // CTA, and the brand URL stacked vertically. Color #1a1a1a (near-black) gives
  // a calm, premium feel and matches the dark walnut table tone from the
  // preceding scenes; the white logo-dark.png wordmark reads cleanly on it.
  //
  // Layout (1080×1920): logo in the upper-middle, CTA centered, URL below.
  //
  // Duration is dynamic — passed in by the orchestrator after probing the
  // voiceover length so the CTA holds long enough to cover the last words.
  const caption = escapeDrawtext(captionAr);
  const brand = escapeDrawtext(TIJARFLOW_BRAND);

  // Two inputs now (background + logo), so we drive everything through a single
  // filter_complex: scale the logo to a fixed width (preserving aspect), overlay
  // it centered horizontally at ~32% height, then draw the CTA + URL beneath.
  const LOGO_W = 480; // px; logo source is 357×120, so height scales to ~161px
  const filterComplex =
    `[1:v]scale=${LOGO_W}:-1[logo];` +
    `[0:v][logo]overlay=x=(W-w)/2:y=H*0.30[bg];` +
    `[bg]drawtext=fontfile=${ARABIC_FONT}` +
    `:text='${caption}':fontsize=84:fontcolor=white` +
    `:text_shaping=1` +
    `:x=(w-text_w)/2:y=(h-text_h)/2+40[withcta];` +
    `[withcta]drawtext=fontfile=${LATIN_FONT}` +
    `:text='${brand}':fontsize=52:fontcolor=#d4af37` + // gold accent; Latin font so the URL isn't tofu
    `:x=(w-text_w)/2:y=(h-text_h)/2+220`;

  await runFfmpeg([
    "-f", "lavfi",
    "-i", `color=c=0x1a1a1a:s=${VIDEO_W}x${VIDEO_H}:d=${durationSec.toFixed(2)}:r=${FPS}`,
    "-i", LOGO_PATH,
    "-filter_complex", filterComplex,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "20",
    "-r", String(FPS),
    outPath,
  ]);
}

// ── Concatenate scenes with crossfades ───────────────────────────────────────

async function stitchScenes(sceneFiles: string[], sceneDurations: number[], outPath: string): Promise<void> {
  // Build the xfade chain. xfade transitions overlap by CROSSFADE_SEC, so each
  // transition N is placed at the END of scene N minus the crossfade.
  if (sceneFiles.length !== sceneDurations.length) {
    throw new RenderError(`stitchScenes: ${sceneFiles.length} files vs ${sceneDurations.length} durations`);
  }
  const inputs: string[] = [];
  for (const f of sceneFiles) {
    inputs.push("-i", f);
  }

  const labels: string[] = [];
  // Cumulative timeline position where the next transition starts.
  let cursor = 0;
  for (let i = 0; i < sceneFiles.length - 1; i++) {
    cursor += sceneDurations[i] - CROSSFADE_SEC;
    const left = i === 0 ? "[0:v]" : `[v${i - 1}]`;
    const right = `[${i + 1}:v]`;
    const out = `[v${i}]`;
    labels.push(`${left}${right}xfade=transition=fade:duration=${CROSSFADE_SEC}:offset=${cursor.toFixed(2)}${out}`);
  }
  const filterComplex = labels.join(";");
  const finalLabel = `[v${sceneFiles.length - 2}]`;

  await runFfmpeg([
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", finalLabel,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "20",
    outPath,
  ]);
}

// ── Mix voiceover over the stitched video ────────────────────────────────────

async function mixAudio(videoPath: string, voiceoverPath: string, outPath: string): Promise<void> {
  // Orchestrator sizes the video to fully cover the voiceover (end-card length
  // is dynamic), so we don't need -shortest here — it would cut the audio if
  // anything goes long. Letting both streams play out keeps the last words
  // audible. Re-encoding video is unnecessary; copy stream.
  await runFfmpeg([
    "-i", videoPath,
    "-i", voiceoverPath,
    "-map", "0:v",
    "-map", "1:a",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    outPath,
  ]);
}

// ── Thumbnail (first frame of "before" scene) ────────────────────────────────

async function extractThumbnail(videoPath: string, outPath: string): Promise<void> {
  // Pick a frame ~5.5s in — that lands on the "before" scene which is the
  // most recognizable preview (phone with the product).
  await runFfmpeg([
    "-ss", "5.5",
    "-i", videoPath,
    "-vframes", "1",
    "-q:v", "3",
    outPath,
  ]);
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function renderDemoVideo(params: RenderParams): Promise<RenderResult> {
  const t0 = Date.now();
  const outDir = path.join(params.storageRoot, "daily-videos", params.jobId);
  await fs.mkdir(outDir, { recursive: true });

  // 1. Measure the voiceover so we can size the end-card to cover it. Without
  //    this the CTA hold was a fixed 3s and any voiceover overhang got cut by
  //    -shortest in the audio mux.
  const voiceoverSec = await probeDuration(params.voiceoverAbsPath);
  const bodySec = 3 * SCENE_DURATION_SEC - 2 * CROSSFADE_SEC; // 14s with current constants
  // End card must hold for at least END_CARD_MIN_SEC, AND long enough so the
  // total video runtime ≥ voiceover + tail buffer. The crossfade INTO the end
  // card already shaves CROSSFADE_SEC off the body, so we don't double-count.
  const requiredTotal = voiceoverSec + END_CARD_TAIL_PAD_SEC;
  const requiredEndCard = Math.max(END_CARD_MIN_SEC, requiredTotal - bodySec + CROSSFADE_SEC);

  // 2. Render each scene independently — Ken Burns alternates in/out/in so
  //    consecutive scenes don't feel monotonous.
  const sceneSpecs: SceneInput[] = [
    { imagePath: params.shopAbsPath, captionAr: params.captions.shop, zoom: "in" },
    { imagePath: params.beforeAbsPath, captionAr: params.captions.before, zoom: "out" },
    { imagePath: params.afterAbsPath, captionAr: params.captions.after, zoom: "in" },
  ];
  const sceneFiles = [
    path.join(outDir, "scene-1.mp4"),
    path.join(outDir, "scene-2.mp4"),
    path.join(outDir, "scene-3.mp4"),
  ];
  const endCardFile = path.join(outDir, "end-card.mp4");

  await Promise.all([
    renderScene(sceneSpecs[0], sceneFiles[0]),
    renderScene(sceneSpecs[1], sceneFiles[1]),
    renderScene(sceneSpecs[2], sceneFiles[2]),
    renderEndCard(params.captions.cta, endCardFile, requiredEndCard),
  ]);

  // 3. Stitch (3 scenes + 1 end card) with crossfades, with per-segment durations.
  const stitchedFile = path.join(outDir, "stitched.mp4");
  const sceneDurations = [
    SCENE_DURATION_SEC,
    SCENE_DURATION_SEC,
    SCENE_DURATION_SEC,
    requiredEndCard,
  ];
  await stitchScenes([...sceneFiles, endCardFile], sceneDurations, stitchedFile);

  // 4. Mix in voiceover. Body + end card now fully covers the voiceover.
  const finalFile = path.join(outDir, "final.mp4");
  await mixAudio(stitchedFile, params.voiceoverAbsPath, finalFile);

  // 4. Thumbnail.
  const thumbFile = path.join(outDir, "thumbnail.jpg");
  await extractThumbnail(finalFile, thumbFile);

  // 5. Clean up the intermediate per-scene + stitched files — disk savings
  //    matter at daily cadence. Keep the source images + voiceover for debug.
  await Promise.all(
    [...sceneFiles, endCardFile, stitchedFile].map((f) => fs.unlink(f).catch(() => undefined)),
  );

  return {
    videoRelativePath: path.join("daily-videos", params.jobId, "final.mp4").replaceAll("\\", "/"),
    thumbnailRelativePath: path.join("daily-videos", params.jobId, "thumbnail.jpg").replaceAll("\\", "/"),
    renderMs: Date.now() - t0,
  };
}
