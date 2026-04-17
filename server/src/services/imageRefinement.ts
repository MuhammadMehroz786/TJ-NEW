import { GoogleGenAI } from "@google/genai";

export function buildRefinementPrompt(instruction: string): string {
  return `You are a professional e-commerce product photographer refining a product image based on client feedback. Think of this as a careful, subtle edit — not a full regeneration.

PRODUCT PRESERVATION (most important):
- Keep the product EXACTLY as it is — same shape, size, proportions, colors, textures, labels, and details.
- Do NOT alter, regenerate, distort, or artistically reinterpret the product.
- Maintain the product's original scale and perspective angle.

CLIENT REFINEMENT REQUEST:
${instruction}

APPLY THE REFINEMENT SUBTLY:
- Interpret the request as a NUANCED edit to the existing composition (background, lighting, color tone, framing, shadows).
- Make only the change the client asked for — do not alter anything else.
- Keep the overall exposure balanced. Never flood the image with white light, blow out highlights, wash out colors, or reduce contrast.
- Preserve the original dynamic range, existing shadows, and color saturation unless explicitly asked to change them.
- If adjusting lighting: change the QUALITY of light (softer, warmer, more directional, better shadow detail) — not its brightness level.
- Result must look like the same photograph after a professional color-grade, not a different image.

STRICT RULES:
- Do NOT add text, watermarks, logos, or branding.
- Do NOT add extra objects, props, or decorations unless explicitly requested.
- Do NOT crop or change the framing unless explicitly requested.
- Do NOT desaturate, over-brighten, or wash out the image.
- The result must look like an authentic photograph, not a composite.`;
}

export async function refineProductImage(
  base64: string,
  mimeType: string,
  instruction: string,
): Promise<{ base64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildRefinementPrompt(instruction);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ inlineData: { mimeType, data: base64 } }, prompt],
    config: { responseModalities: ["image", "text"] },
  });

  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) throw new Error("No response parts returned.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart?.inlineData) throw new Error("No image data in response.");

  return {
    base64: imagePart.inlineData.data as string,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
