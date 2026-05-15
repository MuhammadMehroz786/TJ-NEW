// Single source of truth lives at shared/contentAgent.ts; this file just
// re-exports for ergonomic `@/types/contentAgent` imports and tacks on the
// client-only `ContentDraft` shape returned by the server.
export {
  GenerateInputSchema,
  GenerationOutputSchema,
  HistoryQuerySchema,
  TONES,
  GOALS,
  LANGUAGES,
  PLATFORMS,
} from "../../../shared/contentAgent";

export type {
  GenerateInput,
  GenerationOutput,
  HistoryQuery,
  Tone,
  Goal,
  Language,
  Platform,
} from "../../../shared/contentAgent";

import type { Platform, Tone, Goal, Language } from "../../../shared/contentAgent";

// Server-returned row shape. Subset of Prisma's ContentDraft we care about
// on the client — failed rows are filtered out server-side by default.
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
