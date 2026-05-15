# Short-Form Content Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 admin-only short-form content drafter from Issue #73 — typed brief in, Gemini-generated hook/script/storyboard/per-platform captions out, persisted to a searchable history.

**Architecture:** New vertical slice on the existing TJ-NEW stack. Express routes → service (single-pass Gemini 2.5 Flash call in JSON-schema mode) → Prisma `ContentDraft` table. New tab inside the existing `Admin.tsx` page. Zod schemas shared between server and client via `shared/`. Vitest introduced for tests.

**Tech Stack:** Express 4, Prisma 6, Postgres, `@google/genai`, TypeScript, Zod, React 18, Vite, axios, shadcn/ui, sonner toasts. Vitest (new).

**Spec:** `docs/superpowers/specs/2026-05-14-short-form-content-agent-design.md`

---

## File Map

**Create:**

```
shared/contentAgent.ts                                # Zod schemas + types (single source of truth)
server/src/lib/contentAgent/
  prompt.ts                                           # buildPrompt + responseSchema
  prompt.test.ts
  geminiClient.ts                                     # thin wrapper exposing generateContent(); accepts an inner client for tests
server/src/services/
  contentAgent.ts                                     # orchestrates: validate → call → validate output → persist
  contentAgent.test.ts
server/src/routes/
  contentAgent.ts                                     # POST /generate, GET /history, GET /history/:id
  contentAgent.test.ts
server/vitest.config.ts                               # Vitest config
client/src/types/contentAgent.ts                      # re-exports shared schema types
client/src/components/admin/content-agent/
  ContentAgentTab.tsx                                 # tab body: form + result + history
  GenerateForm.tsx
  ResultPanel.tsx
  HookList.tsx
  ScriptBlock.tsx
  StoryboardTable.tsx
  CaptionTabs.tsx
  HistoryList.tsx
```

**Modify:**

```
server/prisma/schema.prisma                           # add ContentDraft model + User.contentDrafts relation
server/package.json                                   # add zod, vitest, supertest dev deps; add test scripts
server/src/index.ts                                   # mount contentAgentRoutes under /api/admin/content-agent with aiLimiter
client/src/pages/Admin.tsx                            # add "Content Agent" tab pointing to ContentAgentTab
client/package.json                                   # add zod (if not already shared via workspace)
```

---

## Task 1: Add Zod and Vitest, wire test scripts

**Files:**
- Modify: `server/package.json`
- Create: `server/vitest.config.ts`

- [ ] **Step 1: Install dev deps**

Run from repo root:

```bash
cd server && npm install --save zod && npm install --save-dev vitest @vitest/coverage-v8 supertest @types/supertest
```

Expected: deps appear under `dependencies` / `devDependencies`.

- [ ] **Step 2: Add test scripts to `server/package.json`**

Edit the `scripts` block so it includes:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 4: Verify Vitest runs with no tests**

```bash
cd server && npm test
```

Expected: exits 0 with "No test files found" (or similar). If it errors, fix the config before continuing.

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/package-lock.json server/vitest.config.ts
git commit -m "test: add Vitest + Zod to server workspace"
```

---

## Task 2: Add the `ContentDraft` Prisma model and migrate

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Append the model**

Add at the end of `server/prisma/schema.prisma`:

```prisma
model ContentDraft {
  id          String   @id @default(uuid())
  createdAt   DateTime @default(now())
  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id], onDelete: Cascade)

  // Input snapshot
  topic       String   @db.Text
  tone        String
  goal        String
  language    String
  platforms   String[]

  // Output
  hooks       Json
  script      String   @db.Text
  storyboard  Json
  captions    Json

  // Audit
  model         String   @default("gemini-2.5-flash")
  tokensUsed    Int?
  latencyMs     Int?
  status        String   @default("ok")
  failureReason String?  @db.Text

  // Versioning
  parentId String?
  parent   ContentDraft?  @relation("ContentDraftVersions", fields: [parentId], references: [id])
  versions ContentDraft[] @relation("ContentDraftVersions")

  @@index([createdAt])
  @@index([createdById])
}
```

- [ ] **Step 2: Add the back-relation on `User`**

Inside the existing `model User { ... }`, append (alongside the other relation lines):

```prisma
  contentDrafts ContentDraft[]
```

- [ ] **Step 3: Generate the migration**

```bash
cd server && npx prisma migrate dev --name add_content_draft
```

Expected: a new migration directory `prisma/migrations/<timestamp>_add_content_draft/`, Prisma Client regenerated, no errors.

- [ ] **Step 4: Sanity check Prisma can read the new model**

```bash
cd server && npx tsc --noEmit
```

Expected: clean exit. Prisma's generated types include `ContentDraft` and `prisma.contentDraft.*`.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "db: add ContentDraft model for short-form content agent"
```

---

## Task 3: Shared Zod schemas

**Files:**
- Create: `shared/contentAgent.ts`

- [ ] **Step 1: Write the schema file**

```ts
// shared/contentAgent.ts
import { z } from "zod";

export const TONES = ["playful", "professional", "urgent", "inspirational", "educational"] as const;
export const GOALS = ["awareness", "conversion", "engagement"] as const;
export const LANGUAGES = ["ar", "en"] as const;
export const PLATFORMS = ["tiktok", "reels", "shorts"] as const;

export type Tone = (typeof TONES)[number];
export type Goal = (typeof GOALS)[number];
export type Language = (typeof LANGUAGES)[number];
export type Platform = (typeof PLATFORMS)[number];

// Input the admin submits.
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

// Shape Gemini must return.
export const StoryboardSceneSchema = z.object({
  scene: z.number().int().min(1),
  timecode: z.string().min(1), // e.g. "0:00-0:03"
  shot: z.string().min(1),
});
export const PlatformCaptionSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(0).max(20),
});
export const GenerationOutputSchema = z.object({
  hooks: z.array(z.string().min(1)).min(1).max(3),
  script: z.string().min(1),
  storyboard: z.array(StoryboardSceneSchema).min(1).max(12),
  captions: z.record(z.enum(PLATFORMS), PlatformCaptionSchema),
});
export type GenerationOutput = z.infer<typeof GenerationOutputSchema>;

// Refines: every requested platform must appear as a key in captions.
export function validateOutputAgainstInput(
  input: GenerateInput,
  output: GenerationOutput,
): { ok: true } | { ok: false; reason: string } {
  for (const p of input.platforms) {
    if (!output.captions[p]) return { ok: false, reason: `missing captions for ${p}` };
  }
  return { ok: true };
}

// History query.
export const HistoryQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  language: z.enum(LANGUAGES).optional(),
  platform: z.enum(PLATFORMS).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["ok", "failed"]).default("ok"),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
```

- [ ] **Step 2: Type-check**

```bash
cd server && npx tsc --noEmit
```

Expected: clean. The `shared/` files are already in the server's TS path per existing setup.

- [ ] **Step 3: Commit**

```bash
git add shared/contentAgent.ts
git commit -m "feat(content-agent): add shared Zod schemas"
```

---

## Task 4: Prompt builder + response schema (TDD)

**Files:**
- Create: `server/src/lib/contentAgent/prompt.ts`
- Create: `server/src/lib/contentAgent/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/lib/contentAgent/prompt.test.ts
import { describe, expect, it } from "vitest";
import type { GenerateInput } from "../../../../shared/contentAgent";
import { buildPrompt, geminiResponseSchema } from "./prompt";

const base: GenerateInput = {
  topic: "new abaya line launch",
  tone: "playful",
  goal: "awareness",
  language: "ar",
  platforms: ["tiktok", "reels"],
};

describe("buildPrompt", () => {
  it("includes the topic verbatim", () => {
    expect(buildPrompt(base)).toContain("new abaya line launch");
  });

  it("declares Arabic Saudi dialect when language=ar", () => {
    expect(buildPrompt(base)).toContain("Arabic, Saudi dialect");
  });

  it("declares English when language=en", () => {
    expect(buildPrompt({ ...base, language: "en" })).toContain("English");
  });

  it("lists each requested platform", () => {
    const p = buildPrompt(base);
    expect(p).toContain("tiktok");
    expect(p).toContain("reels");
    expect(p).not.toContain("shorts");
  });

  it("includes the tone and goal", () => {
    const p = buildPrompt({ ...base, tone: "urgent", goal: "conversion" });
    expect(p).toContain("urgent");
    expect(p).toContain("conversion");
  });

  it("strips control characters from the topic", () => {
    const p = buildPrompt({ ...base, topic: "abaya launch\nfoo" });
    expect(p).not.toMatch(/ /);
    expect(p).not.toMatch(/\nfoo/);
  });
});

describe("geminiResponseSchema", () => {
  it("requires hooks, script, storyboard, captions", () => {
    const keys = Object.keys(geminiResponseSchema.properties);
    expect(keys).toEqual(expect.arrayContaining(["hooks", "script", "storyboard", "captions"]));
  });

  it("declares captions keys for every platform", () => {
    const captionKeys = Object.keys(geminiResponseSchema.properties.captions.properties);
    expect(captionKeys).toEqual(expect.arrayContaining(["tiktok", "reels", "shorts"]));
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd server && npm test -- prompt.test
```

Expected: FAIL, "Cannot find module './prompt'".

- [ ] **Step 3: Implement `prompt.ts`**

```ts
// server/src/lib/contentAgent/prompt.ts
import type { GenerateInput } from "../../../../shared/contentAgent";

// Strip control chars + newlines from anything user-supplied that lands in the
// prompt body. Keeps the topic from breaking out of its section. The Zod
// schema already capped length at 500, so no length work here.
function sanitizeTopic(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LANG_LABEL: Record<GenerateInput["language"], string> = {
  ar: "Arabic, Saudi dialect",
  en: "English",
};

export function buildPrompt(input: GenerateInput): string {
  const topic = sanitizeTopic(input.topic);
  const platforms = input.platforms.join(", ");
  const lang = LANG_LABEL[input.language];

  return `ROLE: You are a Saudi-market short-form content strategist for TijarFlow.

INPUT
- topic: ${topic}
- tone: ${input.tone}
- goal: ${input.goal}
- platforms: ${platforms}
- output language: ${lang}

TASK — produce ONE coherent short-form concept (15-45 seconds) with:
1. 1-3 hook variations (first 3 seconds; must stop the scroll).
2. Full voiceover script that fits the target duration.
3. Shot-by-shot storyboard (4-8 scenes; each with timecode and a concrete visual description).
4. Per-platform caption + hashtags. Tune length, hashtag count, and CTA per platform:
   - tiktok: punchy caption <=150 chars, 5-8 hashtags, native CTA.
   - reels: caption up to 300 chars, 3-5 hashtags, IG-native CTA.
   - shorts: caption <=100 chars, 2-4 hashtags, YouTube-native CTA.

RULES
- Output STRICT JSON matching the schema. No markdown, no commentary.
- Only include caption objects for the platforms listed above.
- Goal ${input.goal} drives the CTA style.
- Tone ${input.tone} drives wording.
- Avoid: religious claims, political topics, alcohol, gambling, and named-competitor comparisons.`;
}

// Gemini response schema (OpenAPI-flavored JSON Schema accepted by @google/genai).
// Keep keys in sync with shared/contentAgent.ts GenerationOutputSchema.
export const geminiResponseSchema = {
  type: "object",
  required: ["hooks", "script", "storyboard", "captions"],
  properties: {
    hooks: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string" },
    },
    script: { type: "string" },
    storyboard: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        required: ["scene", "timecode", "shot"],
        properties: {
          scene: { type: "integer" },
          timecode: { type: "string" },
          shot: { type: "string" },
        },
      },
    },
    captions: {
      type: "object",
      properties: {
        tiktok: {
          type: "object",
          required: ["caption", "hashtags"],
          properties: {
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
        },
        reels: {
          type: "object",
          required: ["caption", "hashtags"],
          properties: {
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
        },
        shorts: {
          type: "object",
          required: ["caption", "hashtags"],
          properties: {
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
} as const;
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd server && npm test -- prompt.test
```

Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/contentAgent/prompt.ts server/src/lib/contentAgent/prompt.test.ts
git commit -m "feat(content-agent): prompt builder + response schema"
```

---

## Task 5: Gemini client wrapper

**Files:**
- Create: `server/src/lib/contentAgent/geminiClient.ts`

- [ ] **Step 1: Implement the wrapper**

```ts
// server/src/lib/contentAgent/geminiClient.ts
import { GoogleGenAI } from "@google/genai";
import { geminiResponseSchema } from "./prompt";

export interface ContentGeminiClient {
  generate(prompt: string): Promise<{ json: unknown; tokensUsed: number | null }>;
}

export class GeminiContentClient implements ContentGeminiClient {
  private readonly ai: GoogleGenAI;
  private readonly model = "gemini-2.5-flash";

  constructor(apiKey: string = process.env.GEMINI_API_KEY ?? "") {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not set");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(prompt: string): Promise<{ json: unknown; tokensUsed: number | null }> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // Cast: @google/genai's responseSchema type is permissive but accepts
        // OpenAPI-flavored JSON Schema. Schema kept as `const` for inference.
        responseSchema: geminiResponseSchema as unknown as Record<string, unknown>,
        temperature: 0.8,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned empty text");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";
      throw new Error(`Gemini returned non-JSON: ${reason}`);
    }

    const tokensUsed = response.usageMetadata?.totalTokenCount ?? null;
    return { json: parsed, tokensUsed };
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd server && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/contentAgent/geminiClient.ts
git commit -m "feat(content-agent): Gemini client wrapper with JSON schema mode"
```

---

## Task 6: Content agent service (TDD)

**Files:**
- Create: `server/src/services/contentAgent.ts`
- Create: `server/src/services/contentAgent.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/services/contentAgent.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { ContentGeminiClient } from "../lib/contentAgent/geminiClient";
import type { GenerateInput } from "../../../shared/contentAgent";
import { generateDraft } from "./contentAgent";

const validInput: GenerateInput = {
  topic: "new abaya line launch",
  tone: "playful",
  goal: "awareness",
  language: "ar",
  platforms: ["tiktok", "reels"],
};

const validGeminiOutput = {
  hooks: ["خمس ثوانٍ تغيّر طريقتك في اللبس"],
  script: "اليوم نطلق مجموعة العبايات الجديدة...",
  storyboard: [{ scene: 1, timecode: "0:00-0:03", shot: "Close-up of abaya fabric" }],
  captions: {
    tiktok: { caption: "أبهرتنا بإطلالتك!", hashtags: ["abaya", "ksa"] },
    reels: { caption: "Lookbook season is on.", hashtags: ["abaya", "fashion"] },
  },
};

function makePrismaMock() {
  return {
    contentDraft: {
      create: vi.fn(async ({ data }) => ({ id: "draft-1", createdAt: new Date(), ...data })),
    },
  } as unknown as PrismaClient;
}

describe("generateDraft", () => {
  let prisma: PrismaClient;
  let gemini: ContentGeminiClient;

  beforeEach(() => {
    prisma = makePrismaMock();
    gemini = { generate: vi.fn(async () => ({ json: validGeminiOutput, tokensUsed: 123 })) };
  });

  it("persists an ok draft on the happy path", async () => {
    const result = await generateDraft({ prisma, gemini, userId: "admin-1", input: validInput });

    expect(result.status).toBe("ok");
    expect(result.hooks).toEqual(validGeminiOutput.hooks);
    expect(prisma.contentDraft.create).toHaveBeenCalledOnce();
    const args = (prisma.contentDraft.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.data.createdById).toBe("admin-1");
    expect(args.data.tokensUsed).toBe(123);
    expect(args.data.status).toBe("ok");
  });

  it("links parentId for regenerations", async () => {
    await generateDraft({
      prisma,
      gemini,
      userId: "admin-1",
      input: { ...validInput, parentId: "11111111-1111-1111-1111-111111111111" },
    });
    const args = (prisma.contentDraft.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.data.parentId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("retries once on schema failure then persists a failed draft and throws", async () => {
    gemini = { generate: vi.fn(async () => ({ json: { hooks: [] }, tokensUsed: 0 })) }; // invalid

    await expect(
      generateDraft({ prisma, gemini, userId: "admin-1", input: validInput }),
    ).rejects.toMatchObject({ code: "GEMINI_BAD_OUTPUT" });

    expect((gemini.generate as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2); // initial + retry
    expect(prisma.contentDraft.create).toHaveBeenCalledOnce();
    const args = (prisma.contentDraft.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.data.status).toBe("failed");
    expect(args.data.failureReason).toBeTruthy();
  });

  it("rejects an output missing a requested platform caption", async () => {
    gemini = {
      generate: vi.fn(async () => ({
        json: { ...validGeminiOutput, captions: { tiktok: validGeminiOutput.captions.tiktok } },
        tokensUsed: 100,
      })),
    };
    await expect(
      generateDraft({ prisma, gemini, userId: "admin-1", input: validInput }),
    ).rejects.toMatchObject({ code: "GEMINI_BAD_OUTPUT" });
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd server && npm test -- contentAgent.test
```

Expected: FAIL, "Cannot find module './contentAgent'".

- [ ] **Step 3: Implement the service**

```ts
// server/src/services/contentAgent.ts
import type { PrismaClient } from "@prisma/client";
import {
  GenerationOutputSchema,
  validateOutputAgainstInput,
  type GenerateInput,
  type GenerationOutput,
} from "../../../shared/contentAgent";
import { buildPrompt } from "../lib/contentAgent/prompt";
import type { ContentGeminiClient } from "../lib/contentAgent/geminiClient";

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
  "\n\nPREVIOUS ATTEMPT WAS INVALID JSON OR MISSING FIELDS. Return JSON matching the schema EXACTLY, with every requested platform caption present.";

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
      lastError = `output schema invalid: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`;
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd server && npm test -- contentAgent.test
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/contentAgent.ts server/src/services/contentAgent.test.ts
git commit -m "feat(content-agent): service with retry, output validation, failure persistence"
```

---

## Task 7: Express routes (TDD)

**Files:**
- Create: `server/src/routes/contentAgent.ts`
- Create: `server/src/routes/contentAgent.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/routes/contentAgent.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createContentAgentRouter } from "./contentAgent";
import type { ContentGeminiClient } from "../lib/contentAgent/geminiClient";

process.env.JWT_SECRET ??= "test-secret";

function adminToken() {
  return jwt.sign({ userId: "admin-1", email: "a@b.com", role: "ADMIN" }, process.env.JWT_SECRET!);
}
function merchantToken() {
  return jwt.sign({ userId: "m-1", email: "m@b.com", role: "MERCHANT" }, process.env.JWT_SECRET!);
}

const validBody = {
  topic: "new abaya line launch",
  tone: "playful",
  goal: "awareness",
  language: "ar",
  platforms: ["tiktok", "reels"],
};

const validOutput = {
  hooks: ["hook"],
  script: "script",
  storyboard: [{ scene: 1, timecode: "0:00-0:03", shot: "shot" }],
  captions: {
    tiktok: { caption: "c", hashtags: ["a"] },
    reels: { caption: "c", hashtags: ["a"] },
  },
};

function buildApp(opts: {
  gemini: ContentGeminiClient;
  drafts: any[];
}) {
  const app = express();
  app.use(express.json());
  const prismaMock = {
    contentDraft: {
      create: vi.fn(async ({ data }) => {
        const row = { id: `draft-${opts.drafts.length + 1}`, createdAt: new Date(), ...data };
        opts.drafts.push(row);
        return row;
      }),
      findMany: vi.fn(async () => opts.drafts.slice().reverse()),
      findUnique: vi.fn(async ({ where }) => opts.drafts.find((d) => d.id === where.id) ?? null),
    },
  } as any;
  app.use("/api/admin/content-agent", createContentAgentRouter({ prisma: prismaMock, gemini: opts.gemini }));
  return { app, prismaMock };
}

describe("contentAgent routes", () => {
  let gemini: ContentGeminiClient;
  let drafts: any[];

  beforeEach(() => {
    drafts = [];
    gemini = { generate: vi.fn(async () => ({ json: validOutput, tokensUsed: 10 })) };
  });

  it("rejects unauthenticated requests", async () => {
    const { app } = buildApp({ gemini, drafts });
    const res = await request(app).post("/api/admin/content-agent/generate").send(validBody);
    expect(res.status).toBe(401);
  });

  it("rejects non-admin tokens", async () => {
    const { app } = buildApp({ gemini, drafts });
    const res = await request(app)
      .post("/api/admin/content-agent/generate")
      .set("Authorization", `Bearer ${merchantToken()}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it("rejects malformed input with 400", async () => {
    const { app } = buildApp({ gemini, drafts });
    const res = await request(app)
      .post("/api/admin/content-agent/generate")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ ...validBody, platforms: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("persists and returns the draft on success", async () => {
    const { app } = buildApp({ gemini, drafts });
    const res = await request(app)
      .post("/api/admin/content-agent/generate")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.hooks).toEqual(["hook"]);
  });

  it("returns 502 and persists a failed draft when Gemini output is bad", async () => {
    gemini = { generate: vi.fn(async () => ({ json: { hooks: [] }, tokensUsed: 0 })) };
    const { app } = buildApp({ gemini, drafts });
    const res = await request(app)
      .post("/api/admin/content-agent/generate")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send(validBody);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("GEMINI_BAD_OUTPUT");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe("failed");
  });

  it("history excludes failed rows by default and supports cursor", async () => {
    drafts = [
      { id: "11111111-1111-1111-1111-111111111111", createdAt: new Date("2026-01-01"), status: "ok", topic: "a", platforms: ["tiktok"], language: "ar" },
      { id: "22222222-2222-2222-2222-222222222222", createdAt: new Date("2026-01-02"), status: "failed", topic: "b", platforms: ["tiktok"], language: "ar" },
    ];
    const { app, prismaMock } = buildApp({ gemini, drafts });
    const res = await request(app)
      .get("/api/admin/content-agent/history?limit=10")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(prismaMock.contentDraft.findMany).toHaveBeenCalledOnce();
    const args = (prismaMock.contentDraft.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.where.status).toBe("ok");
    expect(args.take).toBe(11); // limit + 1 for nextCursor probe
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd server && npm test -- contentAgent.test
```

Expected: FAIL on the route tests, "Cannot find module './contentAgent'" (the route file).

- [ ] **Step 3: Implement the route**

```ts
// server/src/routes/contentAgent.ts
import { Router, Response, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { GenerateInputSchema, HistoryQuerySchema } from "../../../shared/contentAgent";
import { ContentAgentError, generateDraft } from "../services/contentAgent";
import type { ContentGeminiClient } from "../lib/contentAgent/geminiClient";

interface Deps {
  prisma: PrismaClient;
  gemini: ContentGeminiClient;
}

export function createContentAgentRouter({ prisma, gemini }: Deps): Router {
  const router = Router();
  router.use(authenticate);
  router.use(requireRole("ADMIN"));

  const generate: RequestHandler = async (req: AuthRequest, res: Response) => {
    const parsed = GenerateInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid input",
        code: "VALIDATION_ERROR",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }

    try {
      const draft = await generateDraft({
        prisma,
        gemini,
        userId: req.auth!.userId,
        input: parsed.data,
      });
      res.json(draft);
    } catch (err) {
      if (err instanceof ContentAgentError) {
        res.status(502).json({ error: err.message, code: err.code });
        return;
      }
      const message = err instanceof Error ? err.message : "unknown error";
      console.error("[content-agent] generate failed:", message);
      res.status(500).json({ error: "Generation failed", code: "INTERNAL_ERROR" });
    }
  };

  const history: RequestHandler = async (req: AuthRequest, res: Response) => {
    const parsed = HistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid query",
        code: "VALIDATION_ERROR",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }
    const { cursor, limit, language, platform, q, status } = parsed.data;

    const where: Record<string, unknown> = { status };
    if (language) where.language = language;
    if (platform) where.platforms = { has: platform };
    if (q) where.topic = { contains: q, mode: "insensitive" };

    // Cursor pagination on (createdAt DESC, id DESC). Probe one extra row to
    // know whether there's another page.
    const rows = await prisma.contentDraft.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
    res.json({ items, nextCursor });
  };

  const detail: RequestHandler = async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id);
    const row = await prisma.contentDraft.findUnique({
      where: { id },
      include: { versions: { orderBy: { createdAt: "desc" } } },
    });
    if (!row) {
      res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return;
    }
    res.json(row);
  };

  router.post("/generate", generate);
  router.get("/history", history);
  router.get("/history/:id", detail);
  return router;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd server && npm test -- contentAgent.test
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/contentAgent.ts server/src/routes/contentAgent.test.ts
git commit -m "feat(content-agent): admin routes with cursor pagination + injectable deps"
```

---

## Task 8: Mount routes in `index.ts`

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add the imports** (group with existing route imports near top of file)

```ts
import { createContentAgentRouter } from "./routes/contentAgent";
import { GeminiContentClient } from "./lib/contentAgent/geminiClient";
```

- [ ] **Step 2: Build the singletons** (one shared `prisma` already exists below `const app`; reuse it via a const if needed, or instantiate within the router factory call)

Right after the existing `const prisma = new PrismaClient();` line (or wherever Prisma is instantiated):

```ts
const contentAgentGemini = new GeminiContentClient();
```

If Prisma isn't already a top-level const, add `const contentAgentPrisma = new PrismaClient();` once near the top of the route mounting block.

- [ ] **Step 3: Mount the router** (place after `app.use("/api/admin", adminRoutes);`)

```ts
app.use(
  "/api/admin/content-agent",
  aiLimiter,
  createContentAgentRouter({ prisma: contentAgentPrisma ?? prisma, gemini: contentAgentGemini }),
);
```

(Use whichever Prisma instance is already in scope; the goal is one shared client per process.)

- [ ] **Step 4: Type-check and boot**

```bash
cd server && npx tsc --noEmit
```

Expected: clean.

```bash
cd server && npm run dev
```

Expected: server boots without errors. `curl -i http://localhost:3001/api/admin/content-agent/history` returns `401`.

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(content-agent): mount admin content-agent routes with aiLimiter"
```

---

## Task 9: Re-export shared types on the client

**Files:**
- Create: `client/src/types/contentAgent.ts`

- [ ] **Step 1: Write the file**

```ts
// client/src/types/contentAgent.ts
export {
  GenerateInputSchema,
  HistoryQuerySchema,
  GenerationOutputSchema,
  TONES,
  GOALS,
  LANGUAGES,
  PLATFORMS,
  type GenerateInput,
  type GenerationOutput,
  type HistoryQuery,
  type Tone,
  type Goal,
  type Language,
  type Platform,
} from "../../../shared/contentAgent";

// Server-returned row shape (subset we care about on the client).
export interface ContentDraft {
  id: string;
  createdAt: string;
  createdById: string;
  topic: string;
  tone: Tone;
  goal: Goal;
  language: Language;
  platforms: Platform[];
  hooks: string[];
  script: string;
  storyboard: { scene: number; timecode: string; shot: string }[];
  captions: Partial<Record<Platform, { caption: string; hashtags: string[] }>>;
  status: "ok" | "failed";
  failureReason: string | null;
  parentId: string | null;
  model: string;
  tokensUsed: number | null;
  latencyMs: number | null;
}
```

- [ ] **Step 2: Make sure `zod` is installed in the client workspace**

```bash
cd client && npm install --save zod
```

- [ ] **Step 3: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add client/src/types/contentAgent.ts client/package.json client/package-lock.json
git commit -m "feat(content-agent): client-side shared types"
```

---

## Task 10: `GenerateForm.tsx`

**Files:**
- Create: `client/src/components/admin/content-agent/GenerateForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
// client/src/components/admin/content-agent/GenerateForm.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  GenerateInputSchema,
  GOALS,
  LANGUAGES,
  PLATFORMS,
  TONES,
  type GenerateInput,
} from "@/types/contentAgent";

interface Props {
  initial?: Partial<GenerateInput>;
  busy: boolean;
  onSubmit: (input: GenerateInput) => void;
}

export function GenerateForm({ initial, busy, onSubmit }: Props) {
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [tone, setTone] = useState<GenerateInput["tone"]>(initial?.tone ?? "playful");
  const [goal, setGoal] = useState<GenerateInput["goal"]>(initial?.goal ?? "awareness");
  const [language, setLanguage] = useState<GenerateInput["language"]>(initial?.language ?? "ar");
  const [platforms, setPlatforms] = useState<GenerateInput["platforms"]>(
    initial?.platforms ?? ["tiktok"],
  );

  const candidate = { topic, tone, goal, language, platforms };
  const parsed = GenerateInputSchema.safeParse(candidate);
  const canSubmit = parsed.success && !busy;
  const firstError = parsed.success ? null : parsed.error.issues[0]?.message ?? null;

  function togglePlatform(p: GenerateInput["platforms"][number]) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsed.success) onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="ca-topic">Topic</Label>
        <Textarea
          id="ca-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. New abaya line launch — focus on premium fabric"
          rows={3}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground mt-1">{topic.length} / 500</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tone</Label>
          <Select value={tone} onValueChange={(v) => setTone(v as GenerateInput["tone"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Goal</Label>
          <Select value={goal} onValueChange={(v) => setGoal(v as GenerateInput["goal"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GOALS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Language</Label>
        <div className="flex gap-2 mt-1">
          {LANGUAGES.map((l) => (
            <Button
              key={l}
              type="button"
              variant={language === l ? "default" : "outline"}
              size="sm"
              onClick={() => setLanguage(l)}
            >
              {l.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label>Platforms</Label>
        <div className="flex gap-3 mt-1">
          {PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox checked={platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
              {p}
            </label>
          ))}
        </div>
      </div>

      {firstError && topic.length > 0 && (
        <p className="text-xs text-destructive">{firstError}</p>
      )}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {busy ? "Drafting…" : "Generate"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean. If any shadcn import (`Textarea`, `Checkbox`, `Label`) is missing, install via `npx shadcn-ui@latest add <component>` per existing pattern.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/content-agent/GenerateForm.tsx
git commit -m "feat(content-agent): generate form component"
```

---

## Task 11: Display components — `HookList`, `ScriptBlock`, `StoryboardTable`, `CaptionTabs`

**Files:**
- Create: `client/src/components/admin/content-agent/HookList.tsx`
- Create: `client/src/components/admin/content-agent/ScriptBlock.tsx`
- Create: `client/src/components/admin/content-agent/StoryboardTable.tsx`
- Create: `client/src/components/admin/content-agent/CaptionTabs.tsx`

- [ ] **Step 1: Write `HookList.tsx`**

```tsx
// client/src/components/admin/content-agent/HookList.tsx
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  hooks: string[];
  dir: "ltr" | "rtl";
}

export function HookList({ hooks, dir }: Props) {
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }
  return (
    <div className="space-y-2" dir={dir}>
      <h3 className="text-sm font-semibold">Hooks</h3>
      {hooks.map((h, i) => (
        <div key={i} className="flex items-start gap-2 border rounded p-2">
          <p className="flex-1 text-sm">{h}</p>
          <Button variant="ghost" size="icon" onClick={() => copy(h)} aria-label="Copy hook">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `ScriptBlock.tsx`**

```tsx
// client/src/components/admin/content-agent/ScriptBlock.tsx
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  script: string;
  dir: "ltr" | "rtl";
}

export function ScriptBlock({ script, dir }: Props) {
  async function copy() {
    await navigator.clipboard.writeText(script);
    toast.success("Script copied");
  }
  return (
    <div className="space-y-2" dir={dir}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Script</h3>
        <Button variant="ghost" size="sm" onClick={copy}><Copy className="h-3 w-3 mr-1" />Copy</Button>
      </div>
      <pre className="whitespace-pre-wrap text-sm border rounded p-3 bg-muted/30 font-sans">{script}</pre>
    </div>
  );
}
```

- [ ] **Step 3: Write `StoryboardTable.tsx`**

```tsx
// client/src/components/admin/content-agent/StoryboardTable.tsx
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Scene { scene: number; timecode: string; shot: string }

interface Props {
  scenes: Scene[];
  dir: "ltr" | "rtl";
}

export function StoryboardTable({ scenes, dir }: Props) {
  async function copyAll() {
    const text = scenes.map((s) => `Scene ${s.scene} (${s.timecode}): ${s.shot}`).join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("Storyboard copied");
  }
  return (
    <div className="space-y-2" dir={dir}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Storyboard</h3>
        <Button variant="ghost" size="sm" onClick={copyAll}><Copy className="h-3 w-3 mr-1" />Copy all</Button>
      </div>
      <table className="w-full text-sm border rounded">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-start p-2 w-12">#</th>
            <th className="text-start p-2 w-24">Time</th>
            <th className="text-start p-2">Shot</th>
          </tr>
        </thead>
        <tbody>
          {scenes.map((s) => (
            <tr key={s.scene} className="border-t">
              <td className="p-2 align-top">{s.scene}</td>
              <td className="p-2 align-top whitespace-nowrap">{s.timecode}</td>
              <td className="p-2">{s.shot}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Write `CaptionTabs.tsx`**

```tsx
// client/src/components/admin/content-agent/CaptionTabs.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { Platform } from "@/types/contentAgent";

interface CaptionEntry { caption: string; hashtags: string[] }
interface Props {
  captions: Partial<Record<Platform, CaptionEntry>>;
  dir: "ltr" | "rtl";
}

const LABEL: Record<Platform, string> = { tiktok: "TikTok", reels: "Reels", shorts: "Shorts" };

export function CaptionTabs({ captions, dir }: Props) {
  const platforms = (Object.keys(captions) as Platform[]).filter((p) => captions[p]);
  const [active, setActive] = useState<Platform | undefined>(platforms[0]);

  if (!active) return null;
  const entry = captions[active]!;

  async function copyCaption() {
    await navigator.clipboard.writeText(entry.caption);
    toast.success("Caption copied");
  }
  async function copyHashtags() {
    await navigator.clipboard.writeText(entry.hashtags.map((h) => `#${h}`).join(" "));
    toast.success("Hashtags copied");
  }

  return (
    <div className="space-y-2" dir={dir}>
      <h3 className="text-sm font-semibold">Captions</h3>
      <Tabs value={active} onValueChange={(v) => setActive(v as Platform)}>
        <TabsList>
          {platforms.map((p) => (
            <TabsTrigger key={p} value={p}>{LABEL[p]}</TabsTrigger>
          ))}
        </TabsList>
        {platforms.map((p) => (
          <TabsContent key={p} value={p} className="space-y-2">
            <div className="border rounded p-2">
              <div className="flex justify-between items-start gap-2">
                <p className="flex-1 text-sm whitespace-pre-wrap">{captions[p]!.caption}</p>
                <Button variant="ghost" size="icon" onClick={copyCaption} aria-label="Copy caption">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="border rounded p-2">
              <div className="flex justify-between items-start gap-2">
                <div className="flex flex-wrap gap-1 flex-1">
                  {captions[p]!.hashtags.map((h, i) => (
                    <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">#{h}</span>
                  ))}
                </div>
                <Button variant="ghost" size="icon" onClick={copyHashtags} aria-label="Copy hashtags">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean. If `Tabs` from shadcn isn't installed, run `npx shadcn-ui@latest add tabs`.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/admin/content-agent/HookList.tsx \
        client/src/components/admin/content-agent/ScriptBlock.tsx \
        client/src/components/admin/content-agent/StoryboardTable.tsx \
        client/src/components/admin/content-agent/CaptionTabs.tsx
git commit -m "feat(content-agent): hook/script/storyboard/caption components"
```

---

## Task 12: `ResultPanel.tsx`

**Files:**
- Create: `client/src/components/admin/content-agent/ResultPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// client/src/components/admin/content-agent/ResultPanel.tsx
import { Button } from "@/components/ui/button";
import { HookList } from "./HookList";
import { ScriptBlock } from "./ScriptBlock";
import { StoryboardTable } from "./StoryboardTable";
import { CaptionTabs } from "./CaptionTabs";
import type { ContentDraft } from "@/types/contentAgent";

interface Props {
  draft: ContentDraft | null;
  onRegenerate: () => void;
  busy: boolean;
}

export function ResultPanel({ draft, onRegenerate, busy }: Props) {
  if (!draft) {
    return (
      <div className="border rounded-lg p-6 text-sm text-muted-foreground">
        Fill in the form and click <strong>Generate</strong> to draft a short-form concept.
      </div>
    );
  }

  const dir = draft.language === "ar" ? "rtl" : "ltr";

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs text-muted-foreground uppercase">{draft.language} · {draft.platforms.join(" · ")}</p>
          <p className="font-medium">{draft.topic}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRegenerate} disabled={busy}>
          {busy ? "…" : "Regenerate"}
        </Button>
      </div>
      <HookList hooks={draft.hooks} dir={dir} />
      <ScriptBlock script={draft.script} dir={dir} />
      <StoryboardTable scenes={draft.storyboard} dir={dir} />
      <CaptionTabs captions={draft.captions} dir={dir} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/admin/content-agent/ResultPanel.tsx
git commit -m "feat(content-agent): result panel"
```

---

## Task 13: `HistoryList.tsx`

**Files:**
- Create: `client/src/components/admin/content-agent/HistoryList.tsx`

- [ ] **Step 1: Write the component**

```tsx
// client/src/components/admin/content-agent/HistoryList.tsx
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import { toast } from "sonner";
import type { ContentDraft, Language, Platform } from "@/types/contentAgent";
import { LANGUAGES, PLATFORMS } from "@/types/contentAgent";

interface Props {
  onOpen: (draft: ContentDraft) => void;
  onDuplicate: (draft: ContentDraft) => void;
  refreshKey: number; // bump this externally after a new generation to refetch
}

export function HistoryList({ onOpen, onDuplicate, refreshKey }: Props) {
  const [items, setItems] = useState<ContentDraft[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language | "all">("all");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 20 };
      if (!reset && cursor) params.cursor = cursor;
      if (language !== "all") params.language = language;
      if (platform !== "all") params.platform = platform;
      if (q.trim()) params.q = q.trim();
      const res = await api.get("/admin/content-agent/history", { params });
      const next = res.data.items as ContentDraft[];
      setItems((prev) => (reset ? next : [...prev, ...next]));
      setCursor(res.data.nextCursor);
    } catch (err) {
      toast.error("Could not load history");
    } finally {
      setLoading(false);
    }
  }, [cursor, language, platform, q]);

  // Initial load and on filter/refresh change. Reset paging on filter changes.
  useEffect(() => {
    setCursor(null);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, platform, q, refreshKey]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search topic…"
          className="max-w-xs"
        />
        <Select value={language} onValueChange={(v) => setLanguage(v as Language | "all")}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Lang" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All langs</SelectItem>
            {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l.toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platform} onValueChange={(v) => setPlatform(v as Platform | "all")}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <ul className="divide-y border rounded">
        {items.length === 0 && !loading && (
          <li className="p-3 text-sm text-muted-foreground">No drafts yet.</li>
        )}
        {items.map((d) => (
          <li key={d.id} className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {new Date(d.createdAt).toLocaleString()} · {d.language.toUpperCase()} · {d.platforms.join(", ")}
              </p>
              <p className="text-sm truncate">{d.topic}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => onOpen(d)}>Open</Button>
              <Button variant="ghost" size="sm" onClick={() => onDuplicate(d)}>Duplicate</Button>
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button variant="outline" size="sm" onClick={() => load(false)} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/admin/content-agent/HistoryList.tsx
git commit -m "feat(content-agent): history list with filters + cursor pagination"
```

---

## Task 14: `ContentAgentTab.tsx`

**Files:**
- Create: `client/src/components/admin/content-agent/ContentAgentTab.tsx`

- [ ] **Step 1: Write the tab**

```tsx
// client/src/components/admin/content-agent/ContentAgentTab.tsx
import { useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { GenerateForm } from "./GenerateForm";
import { ResultPanel } from "./ResultPanel";
import { HistoryList } from "./HistoryList";
import type { ContentDraft, GenerateInput } from "@/types/contentAgent";

export function ContentAgentTab() {
  const [current, setCurrent] = useState<ContentDraft | null>(null);
  const [formSeed, setFormSeed] = useState<Partial<GenerateInput> | undefined>();
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function submit(input: GenerateInput, parentId?: string) {
    setBusy(true);
    try {
      const body = parentId ? { ...input, parentId } : input;
      const res = await api.post<ContentDraft>("/admin/content-agent/generate", body);
      setCurrent(res.data);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Generation failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function inputFrom(draft: ContentDraft): Partial<GenerateInput> {
    return {
      topic: draft.topic,
      tone: draft.tone,
      goal: draft.goal,
      language: draft.language,
      platforms: draft.platforms,
    };
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-2">
          <GenerateForm
            initial={formSeed}
            busy={busy}
            onSubmit={(input) => submit(input)}
          />
        </div>
        <div className="md:col-span-3">
          <ResultPanel
            draft={current}
            busy={busy}
            onRegenerate={() => {
              if (!current) return;
              void submit(inputFrom(current) as GenerateInput, current.id);
            }}
          />
        </div>
      </div>
      <HistoryList
        refreshKey={refreshKey}
        onOpen={(d) => setCurrent(d)}
        onDuplicate={(d) => {
          setFormSeed(inputFrom(d));
          setCurrent(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/admin/content-agent/ContentAgentTab.tsx
git commit -m "feat(content-agent): tab orchestrator"
```

---

## Task 15: Add the tab to `Admin.tsx`

**Files:**
- Modify: `client/src/pages/Admin.tsx`

- [ ] **Step 1: Locate the tab list**

Open `client/src/pages/Admin.tsx`. Find the tabs definition (search for `TabsList` or the array of tab keys/labels). The page uses a `Tabs` component with a list of tab keys; add a new entry `content-agent` with label "Content Agent".

- [ ] **Step 2: Add the import**

Near the existing imports:

```ts
import { ContentAgentTab } from "@/components/admin/content-agent/ContentAgentTab";
```

- [ ] **Step 3: Add the trigger and content**

Inside `TabsList`:

```tsx
<TabsTrigger value="content-agent">Content Agent</TabsTrigger>
```

After the last `TabsContent` block:

```tsx
<TabsContent value="content-agent">
  <ContentAgentTab />
</TabsContent>
```

- [ ] **Step 4: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Admin.tsx
git commit -m "feat(content-agent): add Content Agent tab to Admin page"
```

---

## Task 16: End-to-end smoke test

**Files:** none (manual verification)

- [ ] **Step 1: Start the stack**

```bash
# Terminal 1
cd server && npm run dev
# Terminal 2
cd client && npm run dev
```

- [ ] **Step 2: Verify admin route guard**

```bash
curl -i http://localhost:3001/api/admin/content-agent/history
```

Expected: `401 Unauthorized`.

- [ ] **Step 3: Manual UI smoke**

Log in as an admin in the browser, open Admin → Content Agent.

Run six generations covering the matrix:
- AR + TikTok only (awareness, playful)
- AR + Reels + Shorts (conversion, professional)
- AR + all three (engagement, urgent)
- EN + TikTok only
- EN + Reels + Shorts
- EN + all three

For each, verify:
- Generation returns within ~10 s.
- Hooks, script, storyboard, and per-platform captions all populated; no missing platform.
- AR results render right-to-left in the result panel; EN renders left-to-right.
- History list shows the new row at top; filters by language and platform narrow the list correctly.
- Copy buttons all work; toasts appear.
- Regenerate produces a new row in history with `parentId` set (verify in DB or by inspecting network response).

- [ ] **Step 4: Failure-path check**

Temporarily edit `geminiClient.ts` to throw inside `generate()`, restart the server, hit Generate. Expected: 502 in network tab, friendly toast, no UI crash. Revert.

- [ ] **Step 5: Run the full test suite**

```bash
cd server && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit any tiny fixes uncovered during smoke**

```bash
git add -p
git commit -m "fix(content-agent): smoke-test cleanup"
```

(Skip the commit if nothing changed.)

---

## Task 17: Codex QA self-review

**Files:** none (review pass)

Walk every checklist item from spec §15 against the implementation. If any fail, fix and re-run tests.

- [ ] **Step 1: No `any` / unjustified `as`** — grep `server/src` and `client/src/components/admin/content-agent` for `: any\b` and ` as ` and justify or remove each occurrence.
- [ ] **Step 2: Every external call wrapped** — Gemini calls inside `generateDraft` have a try/catch. Prisma calls in the route handler will surface via the generic 500 handler; verify error messages are sanitized.
- [ ] **Step 3: Cursor pagination, not offset** — `GET /history` uses `cursor` + `skip:1`, not `skip: N`.
- [ ] **Step 4: Indexes present** — `@@index([createdAt])` and `@@index([createdById])` on `ContentDraft`.
- [ ] **Step 5: Input validation everywhere** — `GenerateInputSchema` on generate, `HistoryQuerySchema` on history.
- [ ] **Step 6: No `dangerouslySetInnerHTML`, no client-side secrets.**
- [ ] **Step 7: No unused exports / commented-out code.**
- [ ] **Step 8: Naming reads clean** — no functions named `doStuff`, no single-letter vars outside loop indices.
- [ ] **Step 9: Tests pass and cover the matrix** — `npm test` green; the four service tests and six route tests run.
- [ ] **Step 10: Consistency** — same Express route → service → Prisma shape as `aiStudio.ts`; same axios usage as the rest of `Admin.tsx`.
- [ ] **Step 11: Run a final tsc on both workspaces**

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

Expected: both clean.

- [ ] **Step 12: Push the branch**

```bash
git push -u origin feature/content-agent-spec
```

(or whichever branch hosts the work; create a PR once Codex review is done.)

---

## Notes for the implementer

- Read the spec at `docs/superpowers/specs/2026-05-14-short-form-content-agent-design.md` first — it explains the **why** behind these tasks.
- Every Gemini call accepts the client via DI so tests stay offline. Do not call the real Gemini API in any test file.
- Prisma's `String[]` requires Postgres (already in use). Don't switch to comma-joined strings.
- The shared schema is the single source of truth. If you change input shape, change `shared/contentAgent.ts` and the server/client both pick it up.
- Keep commits small per the task structure above — easier to bisect later.
