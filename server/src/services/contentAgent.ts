import type { PrismaClient } from "@prisma/client";
import {
  GenerationOutputSchema,
  validateOutputAgainstInput,
  type GenerateInput,
  type GenerationOutput,
} from "../../../shared/contentAgent";
import { buildPrompt } from "../lib/contentAgent/prompt";
import type { ContentGeminiClient } from "../lib/contentAgent/geminiClient";

// Domain error that the route layer maps to HTTP 502. The string `code` is
// stable for API clients; the message is human-friendly for the toast.
export class ContentAgentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ContentAgentError";
  }
}

interface GenerateDeps {
  prisma: PrismaClient;
  gemini: ContentGeminiClient;
  userId: string;
  input: GenerateInput;
}

const STRICT_RETRY_SUFFIX =
  "\n\nPREVIOUS ATTEMPT WAS INVALID JSON OR MISSING FIELDS. " +
  "Return JSON matching the schema EXACTLY, with every requested platform caption present.";

export async function generateDraft({ prisma, gemini, userId, input }: GenerateDeps) {
  const prompt = buildPrompt(input);
  const start = Date.now();

  let lastError: string | null = null;
  let tokensUsedTotal = 0;
  let validated: GenerationOutput | null = null;

  for (let attempt = 0; attempt < 2 && !validated; attempt++) {
    const promptForAttempt = attempt === 0 ? prompt : prompt + STRICT_RETRY_SUFFIX;
    let raw: { json: unknown; tokensUsed: number | null };
    try {
      raw = await gemini.generate(promptForAttempt);
    } catch (err) {
      lastError = err instanceof Error ? err.message : "unknown gemini error";
      continue;
    }
    tokensUsedTotal += raw.tokensUsed ?? 0;

    const parsed = GenerationOutputSchema.safeParse(raw.json);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      lastError = `output schema invalid: ${paths}`;
      continue;
    }
    const cross = validateOutputAgainstInput(input, parsed.data);
    if (!cross.ok) {
      lastError = cross.reason;
      continue;
    }
    validated = parsed.data;
  }

  const latencyMs = Date.now() - start;

  if (!validated) {
    const failed = await prisma.contentDraft.create({
      data: {
        createdById: userId,
        topic: input.topic,
        tone: input.tone,
        goal: input.goal,
        language: input.language,
        platforms: input.platforms,
        hooks: [],
        script: "",
        storyboard: [],
        captions: {},
        tokensUsed: tokensUsedTotal || null,
        latencyMs,
        status: "failed",
        failureReason: lastError ?? "unknown failure",
        parentId: input.parentId ?? null,
      },
    });
    throw new ContentAgentError(
      "GEMINI_BAD_OUTPUT",
      `Gemini failed to produce valid output: ${lastError ?? "unknown"} (draft ${failed.id})`,
    );
  }

  return prisma.contentDraft.create({
    data: {
      createdById: userId,
      topic: input.topic,
      tone: input.tone,
      goal: input.goal,
      language: input.language,
      platforms: input.platforms,
      hooks: validated.hooks,
      script: validated.script,
      storyboard: validated.storyboard,
      captions: validated.captions,
      tokensUsed: tokensUsedTotal || null,
      latencyMs,
      status: "ok",
      parentId: input.parentId ?? null,
    },
  });
}
