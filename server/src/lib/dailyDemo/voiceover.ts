import { promises as fs } from "fs";
import path from "path";

/**
 * Arabic voiceover generation via ElevenLabs Text-to-Speech.
 *
 * We use a multilingual ElevenLabs voice (Adam by default — a calm male
 * voice that handles Saudi/MSA Arabic reasonably out of the box). Voice
 * selection is configurable via ELEVENLABS_VOICE_ID env var so the admin
 * can swap to a preferred voice without code changes.
 *
 * Output: one MP3 file under storage/daily-videos/<jobId>/voiceover.mp3.
 */

const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam — multilingual
const DEFAULT_MODEL = "eleven_multilingual_v2"; // best Arabic quality

export class VoiceoverError extends Error {
  constructor(message: string) {
    super(`[dailyDemo:voiceover] ${message}`);
    this.name = "VoiceoverError";
  }
}

export async function generateVoiceover(params: {
  scriptAr: string;
  jobId: string;
  storageRoot: string;
}): Promise<{ relativePath: string; bytes: number; ms: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new VoiceoverError("ELEVENLABS_API_KEY not set");

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;

  const t0 = Date.now();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: params.scriptAr,
        model_id: model,
        voice_settings: {
          // Higher stability = less expressive, more consistent — better for
          // a short 12s ad voiceover than the default conversational settings.
          stability: 0.6,
          similarity_boost: 0.75,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "(empty)");
    throw new VoiceoverError(`HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  const ms = Date.now() - t0;

  const relativePath = path
    .join("daily-videos", params.jobId, "voiceover.mp3")
    .replaceAll("\\", "/");
  const absPath = path.join(params.storageRoot, relativePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);

  return { relativePath, bytes: buf.length, ms };
}
