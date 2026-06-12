import path from "path";
import fs from "fs";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";
import { NICHES, Niche } from "../lib/dailyDemo/niches";

/**
 * YouTube Auto-Posting Scheduler for Daily Demo Videos.
 *
 * Responsibilities:
 *   - OAuth2 client management: token load/save/refresh
 *   - Scheduler config load/save (storage/youtube_config.json)
 *   - Background polling loop: checks every 10 seconds if a scheduled
 *     post should fire, then uploads the next "done" + "pending" youtube video
 *   - Manual trigger: uploadVideoNow(id)
 *
 * Tokens and config are stored in `server/storage/` which is .gitignored
 * so deploys never overwrite live credentials.
 *
 * Scheduler modes:
 *   - "interval": post every N minutes after the last successful post
 *   - "time": post once per day at a specific KSA wall-clock time (HH:MM)
 */

const STORAGE_ROOT = path.resolve(process.cwd(), "storage");
const TOKENS_PATH = path.join(STORAGE_ROOT, "youtube_tokens.json");
const CONFIG_PATH = path.join(STORAGE_ROOT, "youtube_config.json");

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

export interface YoutubeSchedulerConfig {
  autoPostEnabled: boolean;
  mode: "interval" | "time"; // interval = every N minutes, time = daily at HH:MM KSA
  intervalMinutes: number;   // used when mode === "interval"
  postTimeKsa: string;       // "HH:MM" used when mode === "time"
  lastPostTime: string | null;
  nextPostTime: string | null;
}

const DEFAULT_CONFIG: YoutubeSchedulerConfig = {
  autoPostEnabled: false,
  mode: "time",
  intervalMinutes: 60,
  postTimeKsa: "09:00",
  lastPostTime: null,
  nextPostTime: null,
};

// ── OAuth2 Client ─────────────────────────────────────────────────────────────

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

// Auto-save refreshed tokens whenever googleapis rotates them
oauth2Client.on("tokens", (tokens) => {
  try {
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(TOKENS_PATH)) {
      existing = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
    }
    const merged = { ...existing, ...tokens };
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2));
    console.log("[YouTube] OAuth tokens refreshed and saved.");
  } catch (err) {
    console.error("[YouTube] Failed to auto-save refreshed tokens:", err);
  }
});

// ── Token Helpers ─────────────────────────────────────────────────────────────

export function loadTokens(): Record<string, unknown> | null {
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      const raw = fs.readFileSync(TOKENS_PATH, "utf-8");
      const tokens = JSON.parse(raw);
      oauth2Client.setCredentials(tokens);
      return tokens;
    }
  } catch (err) {
    console.error("[YouTube] Failed to load tokens:", err);
  }
  return null;
}

export function saveTokens(tokens: Record<string, unknown>): void {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  oauth2Client.setCredentials(tokens);
}

export function clearTokens(): void {
  if (fs.existsSync(TOKENS_PATH)) {
    fs.unlinkSync(TOKENS_PATH);
  }
  oauth2Client.setCredentials({});
}

// ── Config Helpers ────────────────────────────────────────────────────────────

export function loadConfig(): YoutubeSchedulerConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error("[YouTube] Failed to load config:", err);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: YoutubeSchedulerConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ── YouTube Channel Status ────────────────────────────────────────────────────

export async function getChannelStatus(): Promise<{
  connected: boolean;
  channelTitle?: string;
  thumbnailUrl?: string;
  error?: string;
}> {
  const tokens = loadTokens();
  if (!tokens) return { connected: false };

  try {
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const res = await youtube.channels.list({ part: ["snippet"], mine: true });
    const items = res.data.items;
    if (items && items.length > 0) {
      const channel = items[0];
      return {
        connected: true,
        channelTitle: channel.snippet?.title ?? undefined,
        thumbnailUrl: channel.snippet?.thumbnails?.default?.url ?? undefined,
      };
    }
    return { connected: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[YouTube] Status check failed:", msg);
    return { connected: false, error: msg };
  }
}

// ── OAuth URL Generation ──────────────────────────────────────────────────────

export function generateAuthUrl(redirectOrigin: string): string {
  const scopes = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
  ];
  // Encode the frontend origin into state so the callback can redirect back
  const state = Buffer.from(redirectOrigin).toString("base64");
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state,
  });
}

export async function handleOAuthCallback(code: string): Promise<void> {
  const { tokens } = await oauth2Client.getToken(code);
  saveTokens(tokens as Record<string, unknown>);
}

// ── Next Post Time Calculation ────────────────────────────────────────────────

/**
 * Calculate the next UTC timestamp at which we should post, given the config.
 * For "time" mode: find the next occurrence of HH:MM in KSA (UTC+3).
 * For "interval" mode: now + intervalMinutes.
 */
function calcNextPostTime(config: YoutubeSchedulerConfig): Date {
  const now = new Date();
  if (config.mode === "interval") {
    return new Date(now.getTime() + config.intervalMinutes * 60 * 1000);
  }

  // "time" mode — find next KSA HH:MM
  const [hh, mm] = config.postTimeKsa.split(":").map(Number);
  // KSA = UTC+3, no DST
  const ksaOffsetMs = 3 * 60 * 60 * 1000;
  const ksaNow = new Date(now.getTime() + ksaOffsetMs);
  // Build today's target in KSA
  const target = new Date(
    Date.UTC(ksaNow.getUTCFullYear(), ksaNow.getUTCMonth(), ksaNow.getUTCDate(), hh - 3, mm, 0, 0),
  );
  // If that time has already passed today, schedule for tomorrow
  if (target <= now) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target;
}

// ── Video Upload ──────────────────────────────────────────────────────────────

let isPublishing = false;

/**
 * Upload a specific DailyDemoVideo row to YouTube.
 * The video must have status "done" and have a videoPath.
 * Uses the youtubeTitle/youtubeDescription from the script JSON column.
 * Falls back to sensible defaults derived from the niche config.
 */
export async function uploadVideoToYoutube(
  prisma: PrismaClient,
  videoId: string,
): Promise<{ success: boolean; youtubeId?: string; error?: string }> {
  const row = await prisma.dailyDemoVideo.findUnique({ where: { id: videoId } });
  if (!row) return { success: false, error: "Video row not found" };
  if (row.status !== "done") return { success: false, error: "Video is not ready (status != done)" };
  if (!row.videoPath) return { success: false, error: "No video file path on record" };

  const videoAbsPath = path.join(STORAGE_ROOT, row.videoPath);
  if (!fs.existsSync(videoAbsPath)) {
    return { success: false, error: `Video file not found on disk: ${row.videoPath}` };
  }

  const tokens = loadTokens();
  if (!tokens) {
    return { success: false, error: "YouTube channel not connected. Please connect your channel first." };
  }

  // Extract title/description from script JSON, fall back to niche-based defaults
  const script = row.script as Record<string, unknown> | null;
  const nicheConfig = NICHES[row.niche as Niche];
  const title: string =
    (script?.youtubeTitle as string) ??
    `${nicheConfig?.displayName ?? row.niche} — تيجار فلو`;
  const description: string =
    (script?.youtubeDescription as string) ??
    `شاهد كيف يحوّل تيجار فلو صور منتجاتك إلى صور احترافية في ثوانٍ.\n\nجرّب مجاناً على tijarflow.com\n\n#تيجار_فلو #متجر_إلكتروني #تصوير_منتجات`;

  // Mark as uploading
  await prisma.dailyDemoVideo.update({
    where: { id: videoId },
    data: { youtubeStatus: "uploading" },
  });

  try {
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title,
          description,
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoAbsPath),
      },
    });

    const ytId = response.data.id ?? "";
    console.log(`[YouTube] Upload successful! Video ID: ${ytId}`);

    await prisma.dailyDemoVideo.update({
      where: { id: videoId },
      data: {
        youtubeStatus: "completed",
        youtubeId: ytId,
        youtubePublishedAt: new Date(),
        youtubeErrorMessage: null,
      },
    });

    return { success: true, youtubeId: ytId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[YouTube] Upload failed:", errorMessage);
    await prisma.dailyDemoVideo.update({
      where: { id: videoId },
      data: { youtubeStatus: "failed", youtubeErrorMessage: errorMessage },
    });
    return { success: false, error: errorMessage };
  }
}

// ── Background Scheduler Loop ─────────────────────────────────────────────────

let schedulerPrisma: PrismaClient | null = null;

async function schedulerTick(): Promise<void> {
  if (isPublishing) return;
  const config = loadConfig();
  if (!config.autoPostEnabled || !config.nextPostTime) return;

  const nextTime = new Date(config.nextPostTime);
  const now = new Date();
  if (now < nextTime) return;

  // Time to post! Find the oldest "done" video that hasn't been posted to YouTube yet
  if (!schedulerPrisma) return;
  const nextVideo = await schedulerPrisma.dailyDemoVideo.findFirst({
    where: { status: "done", youtubeStatus: "pending" },
    orderBy: { createdAt: "asc" },
  });

  if (!nextVideo) {
    console.log("[YouTube Scheduler] No pending videos ready for YouTube. Rescheduling.");
    config.nextPostTime = calcNextPostTime(config).toISOString();
    saveConfig(config);
    return;
  }

  isPublishing = true;
  console.log(`[YouTube Scheduler] Scheduled time reached. Uploading: ${nextVideo.id} (${nextVideo.niche})`);

  try {
    await uploadVideoToYoutube(schedulerPrisma, nextVideo.id);
    config.lastPostTime = new Date().toISOString();
    config.nextPostTime = calcNextPostTime(config).toISOString();
    saveConfig(config);
  } finally {
    isPublishing = false;
  }
}

export function startYoutubeScheduler(prisma: PrismaClient): void {
  schedulerPrisma = prisma;
  loadTokens(); // Pre-load tokens into oauth2Client on boot
  const config = loadConfig();

  // If auto-post was enabled before restart, recalculate next post time
  if (config.autoPostEnabled && !config.nextPostTime) {
    config.nextPostTime = calcNextPostTime(config).toISOString();
    saveConfig(config);
  }

  // Check every 10 seconds
  setInterval(() => {
    void schedulerTick();
  }, 10_000);

  console.log("[YouTube Scheduler] Started. Polling every 10s.");
}
