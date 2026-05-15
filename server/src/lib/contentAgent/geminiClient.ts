import { GoogleGenAI } from "@google/genai";
import { geminiResponseSchema } from "./prompt";

// Injectable interface so the service can be unit-tested with a stub instead
// of hitting Gemini in CI. Production code wires up GeminiContentClient.
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
    // Cast: @google/genai's responseSchema type is OpenAPI-flavored JSON
    // Schema. Our `as const`-typed object satisfies it at runtime; the cast
    // bridges the looser SDK declaration.
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
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
