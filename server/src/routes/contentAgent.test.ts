import { describe, expect, it, vi, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { PrismaClient } from "@prisma/client";
import { createContentAgentRouter } from "./contentAgent";
import type { ContentGeminiClient } from "../lib/contentAgent/geminiClient";

process.env.JWT_SECRET ??= "test-secret";

function adminToken(): string {
  return jwt.sign({ userId: "admin-1", email: "a@b.com", role: "ADMIN" }, process.env.JWT_SECRET!);
}
function merchantToken(): string {
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

interface DraftRow {
  id: string;
  createdAt: Date;
  status: string;
  topic: string;
  platforms: string[];
  language: string;
  [key: string]: unknown;
}

function buildApp(opts: { gemini: ContentGeminiClient; drafts: DraftRow[] }): {
  app: Express;
  prismaMock: PrismaClient;
} {
  const app = express();
  app.use(express.json());
  const prismaMock = {
    contentDraft: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: DraftRow = {
          id: `draft-${opts.drafts.length + 1}`,
          createdAt: new Date(),
          status: "ok",
          topic: "",
          platforms: [],
          language: "ar",
          ...data,
        };
        opts.drafts.push(row);
        return row;
      }),
      findMany: vi.fn(async () => opts.drafts.slice().reverse()),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        opts.drafts.find((d) => d.id === where.id) ?? null,
      ),
    },
  } as unknown as PrismaClient;
  app.use(
    "/api/admin/content-agent",
    createContentAgentRouter({ prisma: prismaMock, gemini: opts.gemini }),
  );
  return { app, prismaMock };
}

describe("contentAgent routes", () => {
  let gemini: ContentGeminiClient;
  let drafts: DraftRow[];

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
    expect(drafts[0]!.status).toBe("failed");
  });

  it("history excludes failed rows by default and uses cursor probe", async () => {
    drafts = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        createdAt: new Date("2026-01-01"),
        status: "ok",
        topic: "a",
        platforms: ["tiktok"],
        language: "ar",
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        createdAt: new Date("2026-01-02"),
        status: "failed",
        topic: "b",
        platforms: ["tiktok"],
        language: "ar",
      },
    ];
    const { app, prismaMock } = buildApp({ gemini, drafts });
    const res = await request(app)
      .get("/api/admin/content-agent/history?limit=10")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(prismaMock.contentDraft.findMany).toHaveBeenCalledOnce();
    const args = (prismaMock.contentDraft.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { where: { status: string }; take: number };
    expect(args.where.status).toBe("ok");
    expect(args.take).toBe(11);
  });
});
