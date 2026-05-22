import path from "path";
import { PrismaClient } from "@prisma/client";
import { Niche, NICHES, nicheForDate, todayKsaDate } from "../lib/dailyDemo/niches";
import { generateSceneImages } from "../lib/dailyDemo/imageGen";
import { generateVoiceover } from "../lib/dailyDemo/voiceover";
import { renderDemoVideo } from "../lib/dailyDemo/renderVideo";

/**
 * Daily Demo Video orchestrator. Coordinates the full pipeline for a single
 * video and writes the status transitions to the DailyDemoVideo table. Designed
 * to be called from two places:
 *   - the cron job (once per day, picks today's niche)
 *   - the admin "Generate now" endpoint (picks a custom niche)
 *
 * Status machine:
 *   pending → scripting → imaging → voicing → rendering → done
 *                                                     ↘ failed (terminal)
 *
 * Idempotency: the DB row's @@unique([forDate, niche]) makes re-runs safe — if
 * the cron fires twice on the same day for the same niche, the second one
 * fails fast on the upsert.
 *
 * Cost per generation (verified 2026-05-22): ~$0.16 — 3× Gemini Image at
 * ~$0.04 + ElevenLabs ~$0.01 + Gemini text script ~$0.001.
 */

const STORAGE_ROOT = path.resolve(process.cwd(), "storage");

interface ScriptResult {
  voiceoverScript: string;
  captionShop: string;
  captionBefore: string;
  captionAfter: string;
  captionCta: string;
  // Estimated cost for the text generation step (currently fixed — Gemini text
  // is so cheap we don't bother metering tokens).
  costCents: number;
}

/**
 * For now the "script" is deterministic per niche — we know exactly what we
 * want the video to say (hook → "this is your product" → "now it's pro" → CTA).
 * The captions come straight from the niche config; the voiceover is a 4-line
 * Arabic script assembled from those captions plus a fixed flow.
 *
 * We're keeping this rule-based (not Gemini-generated) for the MVP because:
 *   1. It's free
 *   2. It's predictable — no LLM hallucinations changing the framing day to day
 *   3. It's instant
 *
 * Phase 2 can swap this for a Gemini call that varies the wording if we want
 * more freshness across days for the same niche.
 */
function buildScript(niche: Niche): ScriptResult {
  const cfg = NICHES[niche];
  return {
    captionShop: cfg.hookCaptionAr,
    captionBefore: "هذي صورة منتجك",
    captionAfter: "خلال ٣٠ ثانية، صارت احترافية وجاهزة لمتجرك",
    captionCta: "جرّب تيجار فلو اليوم",
    voiceoverScript:
      `${cfg.hookCaptionAr}. ` +
      `هذي صورة منتجك المعتادة. ` +
      `خلال ٣٠ ثانية فقط، باستخدام تيجار فلو، تحوّلت إلى صورة احترافية جاهزة لمتجرك والسوشيال ميديا. ` +
      `وفّرت ساعات من العمل. جرّب تيجار فلو اليوم على ${"tijarflow.com"}.`,
    costCents: 0,
  };
}

export interface RunOptions {
  forDate?: Date;            // KSA date; defaults to today
  niche?: Niche;             // defaults to rotation-for-date
  triggeredBy?: string;      // "cron" | "manual:<userId>"
}

export interface RunResult {
  id: string;
  status: string;
  videoRelativePath?: string;
  thumbnailRelativePath?: string;
  errorMessage?: string;
}

export async function runDailyDemoVideo(
  prisma: PrismaClient,
  opts: RunOptions = {},
): Promise<RunResult> {
  const forDate = opts.forDate ?? todayKsaDate();
  const niche = opts.niche ?? nicheForDate(forDate);
  const triggeredBy = opts.triggeredBy ?? "cron";

  // Idempotent upsert — if a row already exists for this (forDate, niche),
  // we re-use it instead of failing. Useful when admins retry a failed job.
  const existing = await prisma.dailyDemoVideo.findUnique({
    where: { forDate_niche: { forDate, niche } },
  });
  if (existing && existing.status === "done") {
    return {
      id: existing.id,
      status: "done",
      videoRelativePath: existing.videoPath ?? undefined,
      thumbnailRelativePath: existing.thumbnailPath ?? undefined,
    };
  }
  const row = existing
    ? await prisma.dailyDemoVideo.update({
        where: { id: existing.id },
        data: { status: "pending", errorMessage: null, triggeredBy },
      })
    : await prisma.dailyDemoVideo.create({
        data: { forDate, niche, status: "pending", triggeredBy },
      });

  try {
    // 1. Script (deterministic, instant)
    await prisma.dailyDemoVideo.update({ where: { id: row.id }, data: { status: "scripting" } });
    const script = buildScript(niche);
    await prisma.dailyDemoVideo.update({
      where: { id: row.id },
      data: { script: script as unknown as object },
    });

    // 2. Image gen — 3 scenes in parallel
    await prisma.dailyDemoVideo.update({ where: { id: row.id }, data: { status: "imaging" } });
    const imgs = await generateSceneImages({
      niche: NICHES[niche],
      jobId: row.id,
      storageRoot: STORAGE_ROOT,
    });
    await prisma.dailyDemoVideo.update({
      where: { id: row.id },
      data: { imagePaths: [imgs.shop, imgs.before, imgs.after] },
    });

    // 3. Voiceover via ElevenLabs
    await prisma.dailyDemoVideo.update({ where: { id: row.id }, data: { status: "voicing" } });
    const voice = await generateVoiceover({
      scriptAr: script.voiceoverScript,
      jobId: row.id,
      storageRoot: STORAGE_ROOT,
    });
    await prisma.dailyDemoVideo.update({
      where: { id: row.id },
      data: { voiceoverPath: voice.relativePath },
    });

    // 4. ffmpeg render
    await prisma.dailyDemoVideo.update({ where: { id: row.id }, data: { status: "rendering" } });
    const render = await renderDemoVideo({
      storageRoot: STORAGE_ROOT,
      jobId: row.id,
      shopAbsPath: path.join(STORAGE_ROOT, imgs.shop),
      beforeAbsPath: path.join(STORAGE_ROOT, imgs.before),
      afterAbsPath: path.join(STORAGE_ROOT, imgs.after),
      voiceoverAbsPath: path.join(STORAGE_ROOT, voice.relativePath),
      captions: {
        shop: script.captionShop,
        before: script.captionBefore,
        after: script.captionAfter,
        cta: script.captionCta,
      },
    });

    // 5. Done
    // Cost: image ~$0.04 × 3 = $0.12, voiceover ~$0.01, text ~$0. Round to cents.
    const costCents = 13;
    const updated = await prisma.dailyDemoVideo.update({
      where: { id: row.id },
      data: {
        status: "done",
        videoPath: render.videoRelativePath,
        thumbnailPath: render.thumbnailRelativePath,
        costCents,
        renderMs: render.renderMs,
      },
    });
    return {
      id: updated.id,
      status: "done",
      videoRelativePath: updated.videoPath ?? undefined,
      thumbnailRelativePath: updated.thumbnailPath ?? undefined,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await prisma.dailyDemoVideo.update({
      where: { id: row.id },
      data: { status: "failed", errorMessage },
    });
    console.error(`[dailyDemo] generation failed for ${row.id} (${niche}):`, errorMessage);
    return { id: row.id, status: "failed", errorMessage };
  }
}
