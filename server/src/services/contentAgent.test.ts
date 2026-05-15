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
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "draft-1",
        createdAt: new Date(),
        ...data,
      })),
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
    const args = (prisma.contentDraft.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      data: { createdById: string; tokensUsed: number; status: string };
    };
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
    const args = (prisma.contentDraft.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      data: { parentId: string | null };
    };
    expect(args.data.parentId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("retries once on schema failure then persists a failed draft and throws", async () => {
    gemini = { generate: vi.fn(async () => ({ json: { hooks: [] }, tokensUsed: 0 })) };

    await expect(
      generateDraft({ prisma, gemini, userId: "admin-1", input: validInput }),
    ).rejects.toMatchObject({ code: "GEMINI_BAD_OUTPUT" });

    expect((gemini.generate as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    expect(prisma.contentDraft.create).toHaveBeenCalledOnce();
    const args = (prisma.contentDraft.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      data: { status: string; failureReason: string | null };
    };
    expect(args.data.status).toBe("failed");
    expect(args.data.failureReason).toBeTruthy();
  });

  it("rejects an output missing a requested platform caption", async () => {
    gemini = {
      generate: vi.fn(async () => ({
        json: {
          ...validGeminiOutput,
          captions: { tiktok: validGeminiOutput.captions.tiktok },
        },
        tokensUsed: 100,
      })),
    };
    await expect(
      generateDraft({ prisma, gemini, userId: "admin-1", input: validInput }),
    ).rejects.toMatchObject({ code: "GEMINI_BAD_OUTPUT" });
  });
});
