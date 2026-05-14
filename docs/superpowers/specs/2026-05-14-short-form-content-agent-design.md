# Short-Form Content Agent — Design Spec

**Issue:** [#73 — AI Content Agent: Multi-Platform Research & Generation Engine](https://github.com/TijarFlowHQ/TijarFlow-V1/issues/73)
**Scope:** v1 — manual short-form drafter for the internal TijarFlow team. First slice of the larger Content Agent epic.
**Date:** 2026-05-14
**Owner:** Mehroz

---

## 1. Background

Issue #73 calls for an autonomous agentic workflow covering trend research, long-form YouTube scripts, short-form storyboards, and multi-platform generation. The full scope is 3–6 weeks of work across four independent subsystems.

This spec covers **only the first slice**: a manual short-form drafter the internal content team triggers on demand. No trend research, no long-form, no autopilot, no merchant-facing surface. Other slices are deferred to follow-up specs.

## 2. Goals

- Cut the internal team's ideation-to-draft time from hours to under one minute.
- Produce platform-tuned short-form content (TikTok, Reels, YouTube Shorts) from a typed brief.
- Persist every generation so nothing is lost and so the team has a searchable library.
- Reuse the existing TJ-NEW stack — Gemini 2.5 Flash, Express + Prisma, admin auth — with zero new vendors.

## 3. Non-Goals (v1)

- Trend scanning (Google Trends / X / YouTube) — deferred to phase 2.
- Long-form YouTube scripts.
- Snapchat Spotlight outputs.
- Auto-publishing to platforms.
- Merchant-facing surface or per-merchant credit metering.
- AI-generated visual frames (storyboards are text only).
- Performance analytics / post-publish feedback loop.

## 4. Users & Access

- **Audience:** TijarFlow internal team only.
- **Access path:** existing admin auth (`requireAuth` + admin check, same middleware used by `routes/admin.ts`).
- **UI surface:** new "Content Agent" tab in the Admin Dashboard sidebar.
- **No tenant scoping:** single-org tool; rows are scoped to the admin who created them via `createdById`.

## 5. Architecture

A single vertical slice on the existing stack.

```
client/  Admin Dashboard → Content Agent tab
  ContentAgentPage.tsx (form + result + history)
       │
       │  JSON over HTTPS (JWT-admin guarded)
       ▼
server/src/routes/contentAgent.ts
  POST /api/admin/content-agent/generate
  GET  /api/admin/content-agent/history
  GET  /api/admin/content-agent/history/:id
       │
       ▼
server/src/services/contentAgent.ts
  buildPrompt → callGemini → validate → persist
       │
       ▼
Gemini 2.5 Flash (existing GEMINI_API_KEY)
Prisma → Postgres (new table: ContentDraft)
```

Mirrors the shape of the existing `aiStudio.ts` slice (route → service → external AI → DB). No new infrastructure, no new vendor accounts.

## 6. Data Model

One new Prisma model. Migration adds the table and indexes only.

```prisma
model ContentDraft {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])

  // Input snapshot (frozen so re-runs are reproducible)
  topic       String
  tone        String   // playful | professional | urgent | inspirational | educational
  goal        String   // awareness | conversion | engagement
  language    String   // "ar" | "en"
  platforms   String[] // subset of ["tiktok", "reels", "shorts"], length ≥ 1

  // Output
  hooks       Json     // string[] (1–3)
  script      String
  storyboard  Json     // Array<{ scene: number, timecode: string, shot: string }>
  captions    Json     // Record<platform, { caption: string, hashtags: string[] }>

  // Audit
  model         String   @default("gemini-2.5-flash")
  tokensUsed    Int?
  latencyMs     Int?
  status        String   @default("ok") // "ok" | "failed" — failed rows retained for debugging
  failureReason String?  // sanitized Gemini error text when status="failed"; null on success

  // Versioning (regeneration)
  parentId    String?
  parent      ContentDraft?  @relation("Versions", fields: [parentId], references: [id])
  versions    ContentDraft[] @relation("Versions")

  @@index([createdAt])
  @@index([createdById])
}
```

**Design choices:**

- Input fields denormalized into the row so history list renders without joins.
- Outputs stored as `Json` because they are always read as a unit and never queried by inner field.
- `parentId` self-relation handles regenerations without a separate `versions` table.
- Failed generations are persisted with `status = "failed"` so the team can see what went wrong without polluting the success list (filter by `status` in history queries).

## 7. API

### `POST /api/admin/content-agent/generate`

**Body (Zod-validated):**

```ts
{
  topic: string;                                   // trimmed, 3–500 chars
  tone: "playful" | "professional" | "urgent" | "inspirational" | "educational";
  goal: "awareness" | "conversion" | "engagement";
  language: "ar" | "en";
  platforms: Array<"tiktok" | "reels" | "shorts">; // 1–3 entries, unique
  parentId?: string;                               // cuid, optional, marks regeneration
}
```

**Response:** the full `ContentDraft` row (status `200`).

### `GET /api/admin/content-agent/history`

**Query:** `cursor?: string`, `limit?: number (1–50, default 20)`, `language?`, `platform?`, `q?` (case-insensitive substring on `topic`), `status?` (default `"ok"`).
**Response:** `{ items: ContentDraft[], nextCursor: string | null }` — cursor pagination on `(createdAt DESC, id DESC)`. No offset queries.

### `GET /api/admin/content-agent/history/:id`

**Response:** `ContentDraft` with `versions[]` (children by `parentId`) sorted newest-first.

### Shared schema

Zod schemas live in `shared/contentAgent.ts` and are imported by both server (validation) and client (form). One source of truth.

## 8. Prompt Strategy

Single Gemini 2.5 Flash call per generation. JSON mode (`responseMimeType: "application/json"` + `responseSchema` matching the output shape). Schema-locked JSON is reliable on Flash; no string-parsing fallbacks needed in the happy path.

Prompt template (assembled server-side from input):

```
ROLE: You are a Saudi-market short-form content strategist for TijarFlow.

INPUT
- topic: {{topic}}
- tone: {{tone}}
- goal: {{goal}}
- platforms: {{platforms joined by ", "}}
- output language: {{ "Arabic, Saudi dialect" if language=="ar" else "English" }}

TASK — produce ONE coherent short-form concept (15–45 s) with:
1. 1–3 hook variations (first 3 seconds; must stop the scroll).
2. Full voiceover script that fits the target duration.
3. Shot-by-shot storyboard (4–8 scenes; each with timecode and a concrete visual description).
4. Per-platform caption + hashtags. Tune length, hashtag count, and CTA per platform:
   - tiktok: punchy caption ≤150 chars, 5–8 hashtags, native CTA.
   - reels: caption up to 300 chars, 3–5 hashtags, IG-native CTA.
   - shorts: caption ≤100 chars, 2–4 hashtags, YouTube-native CTA.

RULES
- Output STRICT JSON matching the schema. No markdown, no commentary.
- Goal {{goal}} drives the CTA style.
- Tone {{tone}} drives wording.
- Avoid: religious claims, political topics, alcohol, gambling, comparisons to named competitors.
```

The response schema is the same Zod shape as the persisted output fields (`hooks`, `script`, `storyboard`, `captions`), inlined for Gemini.

## 9. Generation Flow

```
1. requireAuth + admin check (existing middleware)
2. Zod-validate body                              → 400 on bad input
3. buildPrompt(input)
4. callGemini(prompt, responseSchema)             // ~2–4 s typical
5. Zod-validate Gemini output (defense in depth)
   - on invalid: ONE retry with stricter instruction
   - still invalid: persist row with status="failed", return 502
6. persist ContentDraft (parentId set if regeneration)
7. return row
```

Synchronous request/response. No queue, no polling. Median latency target: under 6 s end-to-end.

## 10. Error Handling

| Failure                          | HTTP | Behavior                                                     |
| -------------------------------- | ---- | ------------------------------------------------------------ |
| Bad input                        | 400  | Zod issues returned; not logged loudly                       |
| Not authenticated / not admin    | 401 / 403 | Existing middleware behavior                            |
| Gemini timeout (>30 s)           | 504  | Logged; no DB write                                          |
| Gemini malformed JSON after retry| 502  | Persist `status="failed"` row for debugging                  |
| Gemini safety block              | 422  | Friendly UI message; no DB write                             |
| DB write failure                 | 500  | Logged; client sees generic error                            |

Every external call (Gemini, Prisma) is wrapped in try/catch. No silent failures. Errors carry stable codes the UI can map to friendly messages.

## 11. Client UI

One new page, two-pane layout, plus a history list below.

```
/admin/content-agent
├─ GenerateForm     (left, 40%)   topic / tone / goal / language / platforms / [Generate]
├─ ResultPanel      (right, 60%)  Hooks · Script · Storyboard · CaptionTabs · [Regenerate]
└─ HistoryList      (full width)  search + filters + cursor pagination
```

### File layout

```
client/src/pages/admin/ContentAgentPage.tsx
client/src/components/content-agent/
  GenerateForm.tsx
  ResultPanel.tsx
  HookList.tsx
  ScriptBlock.tsx
  StoryboardTable.tsx
  CaptionTabs.tsx
  HistoryList.tsx
client/src/hooks/
  useGenerateContent.ts          // TanStack useMutation
  useContentHistory.ts           // TanStack useInfiniteQuery
client/src/types/contentAgent.ts // re-exports from shared/
```

### Interaction rules

- Form state local; validated with the shared Zod schema on submit. Submit disabled until valid.
- During generation: button shows spinner + "Drafting…"; form locked.
- On success: `useMutation` invalidates the history query and sets `latestDraftId` in page state. Result panel reads from the history cache — no second fetch.
- "Open" on a history row sets `latestDraftId`.
- "Duplicate" prefills the form with the row's input; no auto-submit.
- "Regenerate" submits current input with `parentId = latestDraftId`.
- Copy buttons use `navigator.clipboard.writeText` + existing toast.
- Result panel sets `dir="rtl"` automatically when the draft's `language === "ar"`, independent of UI language.

## 12. Security

- Every route guarded by `requireAuth` + admin check (existing middleware).
- All inputs Zod-validated server-side before any work.
- Topic is a free-text string but is only ever sent to Gemini and stored — never rendered as HTML, executed, or used in shell/SQL.
- Output strings are rendered with React's default escaping (no `dangerouslySetInnerHTML`).
- No secrets in logs; Gemini errors are sanitized before being returned.
- No new env vars; reuses `GEMINI_API_KEY`.

## 13. Observability

- Each generation logs: `userId`, `language`, `platforms`, `latencyMs`, `tokensUsed` (when available), `status`.
- Failed generations remain in the DB with `status = "failed"` and the raw Gemini error in a `failureReason` field on the row (text column added alongside `status`).
- No new dashboards in v1; the history list with a `status` filter is the operations surface.

## 14. Testing

- **Server unit tests** (existing Jest setup):
  - Prompt builder produces expected strings for AR and EN, each tone/goal, each platform combination.
  - Zod schema accepts valid inputs and rejects each of: short topic, unknown tone, empty platforms, duplicate platforms, missing language.
  - Output validator accepts a known-good Gemini response, rejects: missing hooks, malformed storyboard scene, missing platform-keyed caption when the platform was requested.
- **Route integration tests**:
  - Non-admin → 403.
  - Valid generate with a mocked Gemini client returns the persisted row.
  - Mocked Gemini failure persists a `failed` row and returns 502.
  - History pagination returns a stable cursor and excludes `failed` rows by default.
- **Client tests**:
  - Form submit disabled until Zod parse succeeds.
  - Mutation success appends to history list at top and selects the new row.
  - Copy button writes the expected string.

No live Gemini calls in CI — the Gemini client is injected and mocked.

## 15. Codex QA Bar

Per [[feedback-codex-qa]], before this is marked done:

- No `any`, no unjustified `as` casts.
- All external calls (Gemini, Prisma) in try/catch with meaningful errors.
- Cursor pagination, not offset, on history.
- Indexes on `createdAt` and `createdById`.
- Input validation on every route.
- No `dangerouslySetInnerHTML`, no client-side secrets.
- No unused exports, no commented-out blocks.
- Naming reads without comments.
- Tests cover the prompt builder, validators, and the two main route paths.
- Follows existing TJ-NEW patterns (route → service → Prisma, TanStack on client, shared Zod schemas).

## 16. Open Items

None for v1. Future slices (trend research, long-form, autopilot) will get their own specs.

## 17. Rollout

- Branch `feature/content-agent-v1` off TJ-NEW `main`.
- Migration applied to dev DB and verified before any UI work.
- Manual smoke test on dev with both AR and EN, all three platforms.
- Codex QA pass.
- Merge to TJ-NEW `main` → sync to TijarFlow-V1 prod once smoke-tested in dev.
