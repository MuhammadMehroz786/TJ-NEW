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
const VIDEO_W = 1080;
const VIDEO_H = 1920;
const FPS = 25;
const SCENE_DURATION_SEC = 5;        // 3 scenes × 5s = 15s body
const END_CARD_DURATION_SEC = 3;     // total = 18s, well within "10-15s + CTA"
const CROSSFADE_SEC = 0.5;
const TIJARFLOW_BRAND = "tijarflow.com";

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
  const caption = escapeDrawtext(scene.captionAr);
  const drawtext =
    `drawtext=fontfile=${ARABIC_FONT}` +
    `:text='${caption}'` +
    `:fontsize=64:fontcolor=white` +
    `:borderw=4:bordercolor=black@0.85` +
    `:box=1:boxcolor=black@0.55:boxborderw=24` +
    `:x=(w-text_w)/2:y=h-text_h-160` +
    `:text_shaping=1` +
    `:enable='between(t,0.3,${SCENE_DURATION_SEC - 0.2})'`;

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

async function renderEndCard(captionAr: string, outPath: string): Promise<void> {
  // Solid TijarFlow brand color background. Centered Arabic CTA + brand URL.
  // Color #1a1a1a (near-black) gives a calm, premium feel and matches the dark
  // walnut table tone from the preceding scenes.
  const caption = escapeDrawtext(captionAr);
  const brand = escapeDrawtext(TIJARFLOW_BRAND);

  const vf =
    `drawtext=fontfile=${ARABIC_FONT}` +
    `:text='${caption}':fontsize=84:fontcolor=white` +
    `:text_shaping=1` +
    `:x=(w-text_w)/2:y=(h-text_h)/2-100,` +
    `drawtext=fontfile=${ARABIC_FONT}` +
    `:text='${brand}':fontsize=52:fontcolor=#d4af37` + // gold accent
    `:x=(w-text_w)/2:y=(h-text_h)/2+100`;

  await runFfmpeg([
    "-f", "lavfi",
    "-i", `color=c=0x1a1a1a:s=${VIDEO_W}x${VIDEO_H}:d=${END_CARD_DURATION_SEC}:r=${FPS}`,
    "-vf", vf,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "20",
    "-r", String(FPS),
    outPath,
  ]);
}

// ── Concatenate scenes with crossfades ───────────────────────────────────────

async function stitchScenes(sceneFiles: string[], outPath: string): Promise<void> {
  // Build the xfade chain. xfade transitions overlap by CROSSFADE_SEC.
  // offset for transition N = (N × SCENE_DURATION_SEC) - (N × CROSSFADE_SEC)
  const inputs: string[] = [];
  for (const f of sceneFiles) {
    inputs.push("-i", f);
  }

  const labels: string[] = [];
  let cumulativeOffset = 0;
  for (let i = 0; i < sceneFiles.length - 1; i++) {
    const sceneLen = i === sceneFiles.length - 2 ? END_CARD_DURATION_SEC : SCENE_DURATION_SEC;
    cumulativeOffset += (i === 0 ? SCENE_DURATION_SEC : sceneLen) - CROSSFADE_SEC;
    const left = i === 0 ? "[0:v]" : `[v${i - 1}]`;
    const right = `[${i + 1}:v]`;
    const out = `[v${i}]`;
    labels.push(`${left}${right}xfade=transition=fade:duration=${CROSSFADE_SEC}:offset=${cumulativeOffset.toFixed(2)}${out}`);
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
  await runFfmpeg([
    "-i", videoPath,
    "-i", voiceoverPath,
    "-map", "0:v",
    "-map", "1:a",
    // Pad audio to match video length so the video doesn't get cut short if
    // voiceover ends before video.
    "-af", "apad",
    "-shortest",
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

  // 1. Render each scene independently — Ken Burns alternates in/out/in/out so
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
    renderEndCard(params.captions.cta, endCardFile),
  ]);

  // 2. Stitch (3 scenes + 1 end card) with crossfades.
  const stitchedFile = path.join(outDir, "stitched.mp4");
  await stitchScenes([...sceneFiles, endCardFile], stitchedFile);

  // 3. Mix in voiceover.
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
