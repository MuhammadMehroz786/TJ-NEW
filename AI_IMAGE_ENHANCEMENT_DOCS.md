# 🖼️ AI Image Enhancement Feature — Complete Documentation

## Table of Contents

- [1. Feature Overview](#1-feature-overview)
- [2. What This Feature Does](#2-what-this-feature-does)
- [3. How It Works — Complete Flow](#3-how-it-works--complete-flow)
- [4. Architecture Diagram](#4-architecture-diagram)
- [5. Files Modified — Summary Table](#5-files-modified--summary-table)
- [6. Backend Implementation — Detailed Code Walkthrough](#6-backend-implementation--detailed-code-walkthrough)
- [7. Frontend Implementation — Detailed Code Walkthrough](#7-frontend-implementation--detailed-code-walkthrough)
- [8. Prompt Engineering — How the AI Prompt Works](#8-prompt-engineering--how-the-ai-prompt-works)
- [9. Background Scenes — All Available Options](#9-background-scenes--all-available-options)
- [10. API Reference](#10-api-reference)
- [11. Error Handling](#11-error-handling)
- [12. Dependencies & Environment Setup](#12-dependencies--environment-setup)
- [13. How to Use — Step by Step](#13-how-to-use--step-by-step)
- [14. Future Upgrade Options](#14-future-upgrade-options)

---

## 1. Feature Overview

The **AI Image Enhancement** feature allows TijarFlow users to automatically enhance their product images using Google's **Gemini 2.5 Flash Image** AI model. This is an **image-to-image** editing feature — it takes the user's uploaded product photo and:

1. **Keeps the product exactly the same** — no regeneration, no changes to the product itself
2. **Improves the image quality** — enhances sharpness, lighting, color balance, and clarity
3. **Changes the background** — removes the existing background and replaces it with a professional scene selected by the user (Studio, Kitchen, Mall, Outdoor, etc.)

This means a bad photo taken on a phone with a messy background will be transformed into a professional-looking e-commerce product shot while the product itself remains pixel-perfect identical.

---

## 2. What This Feature Does

### Before Enhancement
- Low-quality phone photo
- Poor lighting
- Messy/distracting background
- Bad color balance

### After Enhancement
- Professional e-commerce quality
- Perfect studio/scene lighting
- Clean, professional background (user's choice: Studio, Kitchen, Mall, etc.)
- Enhanced sharpness and color

### Key Design Decisions

| Decision | Reasoning |
|----------|-----------|
| **Image-to-Image (not text-to-image)** | The product must stay IDENTICAL. We're editing, not generating. |
| **Manual trigger ("AI Enhancement" button)** | Users control when to enhance — not automatic on every upload |
| **Batch processing (all images at once)** | One click enhances ALL uploaded images sequentially |
| **Background dropdown** | Users choose the scene that fits their product category |
| **Google Gemini 2.5 Flash Image** | Free tier available, supports image editing via `generateContent` API |

---

## 3. How It Works — Complete Flow

### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER ACTIONS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User opens "Add Product" or "Edit Product" dialog           │
│  2. User uploads one or more product images                     │
│  3. User selects a background from the dropdown (e.g. "Kitchen")│
│  4. User clicks the "AI Enhancement" button                     │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Products.tsx)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  5. handleEnhanceAllImages() is called                          │
│  6. For EACH image in the array:                                │
│     a. Show progress: "Enhancing image 1 of 3..."              │
│     b. Send POST /api/products/enhance-image with:              │
│        - image: base64 string of the uploaded image             │
│        - title: product title (optional, for AI context)        │
│        - description: product description (optional)            │
│        - background: selected scene key (e.g. "kitchen")        │
│     c. Receive enhanced image back as base64                    │
│     d. Replace the old image in form.images[i]                  │
│  7. Show success toast: "3 image(s) enhanced successfully!"     │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (products.ts)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  8. Route handler receives the request                          │
│  9. Validates: image exists + GEMINI_API_KEY is configured      │
│ 10. Looks up the background scene description from the map      │
│ 11. Builds the image-to-image editing prompt:                   │
│     "Edit this product image:                                   │
│      - KEEP the product exactly as it is                        │
│      - REMOVE the background                                    │
│      - REPLACE with: [selected scene description]               │
│      - IMPROVE quality, sharpness, lighting..."                 │
│ 12. Parses the base64 image data from the data URL              │
│ 13. Sends [image + prompt] to Gemini 2.5 Flash Image            │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              GOOGLE GEMINI 2.5 FLASH IMAGE API                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 14. Model: "gemini-2.5-flash-image"                             │
│ 15. Method: generateContent()                                   │
│ 16. Config: responseModalities: ["image", "text"]               │
│ 17. Receives: original image + editing instructions             │
│ 18. Returns: edited image with improved quality + new background│
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RESPONSE BACK TO USER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 19. Backend extracts image from response.candidates[0].parts    │
│ 20. Finds the part with inlineData.mimeType starting "image/"   │
│ 21. Converts to data URL: "data:image/png;base64,..."           │
│ 22. Sends JSON response: { image: "data:...", prompt: "..." }   │
│ 23. Frontend replaces old image with enhanced version           │
│ 24. UI updates immediately — user sees the enhanced image       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---



Data Flow:
  Frontend sends:  { image: "data:image/jpeg;base64,...", title, description, background }
  Backend builds:  prompt + image → sends to Gemini API
  Gemini returns:  edited image in response.candidates[0].content.parts
  Backend sends:   { image: "data:image/png;base64,...", prompt: "..." }
  Frontend:        Replaces old image in form.images array → UI updates
```

---

## 5. Files Modified — Summary Table

| File | Location | Type | What Was Changed |
|------|----------|------|------------------|
| `products.ts` | `server/src/routes/products.ts` | Backend Route | Added `POST /api/products/enhance-image` endpoint + imported `GoogleGenAI` |
| `Products.tsx` | `client/src/pages/Products.tsx` | Frontend Page | Added `handleEnhanceAllImages()`, "AI Enhancement" button, background dropdown, progress states |
| `.env` | `server/.env` | Configuration | Added `GEMINI_API_KEY` environment variable |
| `package.json` | `server/package.json` | Dependencies | Installed `@google/genai` npm package |

---

## 6. Backend Implementation — Detailed Code Walkthrough

### File: `server/src/routes/products.ts`

### 6.1 New Import (Line 6)

```typescript
import { GoogleGenAI } from "@google/genai";
```

**What it does:** Imports the official Google Generative AI SDK for Node.js/TypeScript. This provides the `GoogleGenAI` class used to communicate with Google's AI models including Gemini 2.5 Flash Image.

---

### 6.2 New Route: `POST /api/products/enhance-image` (Lines 258–339)

This is the core of the feature. Here is the complete code with line-by-line explanation:

#### Step 1: Extract Request Body

```typescript
const { image, title, description, background } = req.body;
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | `string` | **Yes** | Base64 data URL of the uploaded product image (e.g., `data:image/jpeg;base64,...`) |
| `title` | `string` | No | Product title — gives AI context about what the product is |
| `description` | `string` | No | Product description — additional context for the AI |
| `background` | `string` | No | Background scene key (e.g., `"kitchen"`, `"mall"`). Defaults to `"studio"` |

#### Step 2: Validate Required Fields

```typescript
if (!image) {
  res.status(400).json({ 
    error: "Please upload an image first to enhance it", 
    code: "VALIDATION_ERROR" 
  });
  return;
}

if (!process.env.GEMINI_API_KEY) {
  res.status(500).json({ 
    error: "GEMINI_API_KEY is not set", 
    code: "CONFIG_ERROR" 
  });
  return;
}
```

**Why image is required:** This is an image-to-image editing feature. Without an original image, there's nothing to enhance. The AI needs to see the product to keep it identical.

#### Step 3: Initialize Google GenAI Client

```typescript
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

Creates a new client instance using the API key from the environment.

#### Step 4: Look Up Background Scene

```typescript
const backgroundScenes: Record<string, string> = {
  studio: "a clean pure white studio background...",
  kitchen: "a modern luxury kitchen countertop...",
  mall: "a premium shopping mall display shelf...",
  // ... 8 total options
};

const sceneName = background && backgroundScenes[background] ? background : "studio";
const sceneDescription = backgroundScenes[sceneName];
```

**How it works:** The `background` parameter from the request is used to look up a detailed natural-language description of the scene. If no background is specified or an invalid key is sent, it defaults to `"studio"` (clean white background).

#### Step 5: Build the Image-to-Image Editing Prompt

```typescript
const productContext = title
  ? `This is a product photo of: ${title}${description ? `. ${description}` : ""}.`
  : "This is a product photo.";

const finalPrompt = `${productContext} Edit this product image with the following instructions:

1. KEEP THE PRODUCT EXACTLY AS IT IS — do NOT change, modify, or regenerate the product itself.
2. REMOVE the current background completely.
3. REPLACE the background with: ${sceneDescription}.
4. IMPROVE the overall image quality: enhance sharpness, fix lighting, improve color balance.
5. Make the product look like it was photographed by a professional e-commerce photographer.
6. Do NOT add any text, watermarks, or logos.
7. The final result should look like a high-quality, professional product photograph.`;
```

**Why numbered instructions:** The AI model follows numbered, explicit instructions more reliably than a single paragraph. Rule #1 (KEEP THE PRODUCT EXACTLY) is the most critical — without this, the AI might regenerate the entire product.

#### Step 6: Parse and Send Image to Gemini

```typescript
// Parse the base64 data URL
const match = image.match(/^data:([^;]+);base64,(.+)$/);
const mimeType = match ? match[1] : "image/jpeg";
const base64Data = match ? match[2] : image.split(",")[1] || image;

// Image goes FIRST in the contents array
const contents: any[] = [
  { inlineData: { mimeType, data: base64Data } },
  finalPrompt,
];

// Call the AI model
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents,
  config: {
    responseModalities: ["image", "text"],
  },
});
```

**Why image is sent FIRST:** By placing the image before the text prompt in the `contents` array, the model focuses on the image as the primary subject and treats the text as editing instructions.

**Why `responseModalities: ["image", "text"]`:** This tells Gemini to output an image in its response. Without this config, the model would only return text.

#### Step 7: Extract the Enhanced Image from Response

```typescript
const parts = response.candidates?.[0]?.content?.parts;
if (!parts) throw new Error("No response parts returned.");

const imagePart = parts.find((p: any) => 
  p.inlineData?.mimeType?.startsWith("image/")
);
if (!imagePart?.inlineData) throw new Error("No image data in response.");

const outputMimeType = imagePart.inlineData.mimeType || "image/png";
const base64 = imagePart.inlineData.data;

res.json({ 
  image: `data:${outputMimeType};base64,${base64}`, 
  prompt: finalPrompt 
});
```

**How the response works:** Gemini returns a `candidates` array. Each candidate has `content.parts` which is an array of parts. Each part can be either text or image data. We find the part that has `inlineData.mimeType` starting with `"image/"` and extract its base64 data.

---

## 7. Frontend Implementation — Detailed Code Walkthrough

### File: `client/src/pages/Products.tsx`

### 7.1 New State Variables

```typescript
const [enhancing, setEnhancing] = useState(false);
const [enhanceProgress, setEnhanceProgress] = useState("");
const [enhanceBackground, setEnhanceBackground] = useState("studio");
```

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `enhancing` | `boolean` | `false` | Whether the AI enhancement is currently processing |
| `enhanceProgress` | `string` | `""` | Progress message displayed during processing (e.g., "Enhancing image 1 of 3...") |
| `enhanceBackground` | `string` | `"studio"` | Currently selected background scene from the dropdown |

### 7.2 `handleEnhanceAllImages()` Function — Complete Code

```typescript
const handleEnhanceAllImages = async () => {
  // Guard: must have at least one image
  if (form.images.length === 0) {
    toast.error("Please upload at least one image first");
    return;
  }

  setEnhancing(true);               // Show loading state
  const newImages = [...form.images]; // Copy the images array
  let enhanced = 0;                   // Counter for successfully enhanced images

  try {
    // Process each image one-by-one (sequential, not parallel)
    for (let i = 0; i < newImages.length; i++) {
      // Update progress message
      setEnhanceProgress(`Enhancing image ${i + 1} of ${newImages.length}...`);
      
      // Call the backend API
      const res = await api.post("/products/enhance-image", {
        image: newImages[i],           // The current image as base64
        title: form.title,             // Product title (optional context)
        description: form.description, // Product description (optional context)
        background: enhanceBackground  // Selected background scene
      });
      
      // Replace the old image with the enhanced one
      newImages[i] = res.data.image;
      enhanced++;
    }

    // All images enhanced successfully
    setForm({ ...form, images: newImages });
    toast.success(`${enhanced} image(s) enhanced successfully!`);
  } catch (err: unknown) {
    // Handle errors
    const message = (err as any)?.response?.data?.error || "Failed to enhance images.";
    toast.error(message);
    
    // PARTIAL SUCCESS: if some images were enhanced before the error,
    // still save those enhanced images (don't throw them away)
    if (enhanced > 0) {
      setForm({ ...form, images: newImages });
    }
  } finally {
    // Always reset loading state
    setEnhancing(false);
    setEnhanceProgress("");
  }
};
```

**Why sequential processing?**
- Google API has rate limits — sending all images in parallel would likely hit them
- Users see meaningful progress ("Enhancing image 2 of 5...")
- If image 3 fails, images 1 and 2 are still saved (partial success)

### 7.3 UI Layout — "AI Enhancement" Button + Background Dropdown

```
┌────────────────────────────────────────────────────┐
│  Media                                             │
│  Drag & drop images, browse files, or add by URL   │
│                                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │          [Drag & Drop Zone]                 │   │
│  │          or click to browse files           │   │
│  └─────────────────────────────────────────────┘   │
│                                                    │
│  [Image URL Input                        ] [Add]   │
│                                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│  │ img1 │ │ img2 │ │ img3 │ │ img4 │              │
│  │ Cover│ │      │ │      │ │      │              │
│  └──────┘ └──────┘ └──────┘ └──────┘              │
│                                                    │
│  ┌──────────────────────────┐ ┌──────────────┐     │
│  │   AI Enhancement         │ │ Studio     ▼ │     │
│  └──────────────────────────┘ └──────────────┘     │
│                                                    │
│  ─────────────── (horizontal line) ──────────────  │
│                                                    │
│  Pricing                                           │
│  ...                                               │
└────────────────────────────────────────────────────┘
```

The button and dropdown sit in a `flex` row:
- **Left side:** "AI Enhancement" button (takes remaining width with `flex-1`)
- **Right side:** Background dropdown (fixed width `w-[150px]`)
- Both use matching teal color theme (`border-teal-200 text-teal-700`)

### 7.4 Button States

| State | What the User Sees |
|-------|-------------------|
| **No images uploaded** | Button + dropdown are completely hidden |
| **Images uploaded, idle** | Teal outlined button: "AI Enhancement" + Background dropdown |
| **Enhancement in progress** | Spinning loader + "Enhancing image 1 of 3..." (dropdown stays visible but button is disabled) |
| **Success** | Toast notification: "3 image(s) enhanced successfully!" |
| **Error** | Toast notification with error message. Already-enhanced images are preserved. |

---

## 8. Prompt Engineering — How the AI Prompt Works

The prompt is the most critical part of this feature. It's structured in 7 numbered rules to ensure the AI follows each instruction precisely:

```
This is a product photo of: [Product Title]. [Product Description].
Edit this product image with the following instructions:

1. KEEP THE PRODUCT EXACTLY AS IT IS — do NOT change, modify, or regenerate 
   the product itself. The product must remain pixel-perfect identical in shape, 
   color, texture, and every detail.

2. REMOVE the current background completely.

3. REPLACE the background with: [selected scene description].

4. IMPROVE the overall image quality: enhance sharpness, fix lighting to look 
   professional, improve color balance, and increase clarity.

5. Make the product look like it was photographed by a professional 
   e-commerce photographer.

6. Do NOT add any text, watermarks, or logos.

7. The final result should look like a high-quality, professional 
   product photograph.
```

### Why This Structure Works

| Rule | Why It's Important |
|------|-------------------|
| **Rule 1 (KEEP PRODUCT)** | Without this explicit instruction, AI models tend to "reimagine" the product, changing its shape or color. CAPITALIZING key words adds emphasis. |
| **Rule 2 (REMOVE BG)** | Clear separation between background removal and replacement steps |
| **Rule 3 (REPLACE BG)** | Uses the detailed scene description from the dropdown selection |
| **Rule 4 (IMPROVE QUALITY)** | Specific improvements listed: sharpness, lighting, color balance, clarity |
| **Rule 5 (PROFESSIONAL)** | Sets the overall quality expectation |
| **Rule 6 (NO TEXT)** | Prevents the AI from adding promotional text or logos |
| **Rule 7 (FINAL RESULT)** | Reinforces the end goal |

---

## 9. Background Scenes — All Available Options

| Key | Dropdown Label | Scene Description Sent to AI |
|-----|---------------|------------------------------|
| `studio` | Studio | A clean pure white studio background with professional soft-box lighting and a subtle shadow underneath the product |
| `kitchen` | Kitchen | A modern luxury kitchen countertop with marble surface, warm ambient lighting, and slightly blurred kitchen appliances in the background |
| `mall` | Mall | A premium shopping mall display shelf with elegant retail store lighting, soft spotlights, and glass shelving |
| `outdoor` | Outdoor | A beautiful outdoor setting with soft golden-hour sunlight and a lush green bokeh background |
| `living_room` | Living Room | A cozy modern living room with stylish furniture, warm natural light coming from large windows |
| `office` | Office | A sleek modern office desk with clean workspace, minimalist decor, and professional lighting |
| `nature` | Nature | A natural organic setting with a wooden surface, fresh green leaves and plants in soft-focus background |
| `gradient` | Gradient | A smooth gradient background with soft pastel tones, clean and modern with no distractions |

---

## 10. API Reference

### `POST /api/products/enhance-image`

**Authentication:** Required (JWT Bearer token)

**Request Body:**

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "title": "Red Running Shoes",
  "description": "Lightweight breathable mesh sneakers",
  "background": "kitchen"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | `string` | **Yes** | Base64 data URL of the product image |
| `title` | `string` | No | Product title for AI context |
| `description` | `string` | No | Product description for AI context |
| `background` | `string` | No | Background scene key. Default: `"studio"`. Options: `studio`, `kitchen`, `mall`, `outdoor`, `living_room`, `office`, `nature`, `gradient` |

**Success Response (200):**

```json
{
  "image": "data:image/png;base64,iVBORw0KGgo...",
  "prompt": "This is a product photo of: Red Running Shoes. Edit this product image..."
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Please upload an image first to enhance it |
| 500 | `CONFIG_ERROR` | GEMINI_API_KEY is not set |
| 500 | `ENHANCE_ERROR` | [Dynamic error from Gemini API] |

---

## 11. Error Handling

### Backend Errors

| Error | HTTP Code | When It Happens | User Sees |
|-------|-----------|----------------|-----------|
| No image provided | 400 | Request has no `image` field | "Please upload an image first to enhance it" |
| Missing API key | 500 | `GEMINI_API_KEY` not in `.env` | "GEMINI_API_KEY is not set" |
| Gemini returns no parts | 500 | API success but empty response | "No response parts returned." |
| Gemini returns no image | 500 | Response has text but no image | "No image data in response." |
| API call failure | 500 | Network error, rate limit, etc. | Dynamic error message from Gemini |

### Frontend Errors

| Scenario | Behavior |
|----------|----------|
| No images uploaded | Toast: "Please upload at least one image first" |
| API returns error | Toast with the error message |
| Fails mid-batch (e.g., image 3 of 5 fails) | Error toast shown. Images 1 and 2 (already enhanced) are preserved. Images 4 and 5 remain unchanged. |
| All images enhanced | Success toast: "3 image(s) enhanced successfully!" |

---

## 12. Dependencies & Environment Setup

### NPM Package Installed

```bash
npm install @google/genai
```

| Package | Version | Purpose |
|---------|---------|---------|
| `@google/genai` | Latest | Official Google Generative AI SDK — provides `GoogleGenAI` class for Gemini model access |

### Environment Variable

**File:** `server/.env`

```
GEMINI_API_KEY="your-google-ai-studio-api-key-here"
```

**How to get an API key:**
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and paste it in `.env`

**Important:** The API key MUST be from Google AI Studio (not Google Cloud Console). It must have access to the `gemini-2.5-flash-image` model.

### Free Tier Limits

| Resource | Limit |
|----------|-------|
| Requests per minute | 15 |
| Requests per day | 1,500 |
| Input token limit | 1,048,576 |

---

## 13. How to Use — Step by Step

1. **Start the application**
   ```bash
   npm run dev
   ```

2. **Navigate to the Products page** in the frontend

3. **Click "Add Product"** (or edit an existing product)

4. **Upload product images** — use drag & drop, file browser, or paste an image URL

5. **Select a background** from the dropdown on the right side:
   - Studio (default — clean white background)
   - Kitchen, Mall, Outdoor, Living Room, Office, Nature, or Gradient

6. **Click "AI Enhancement"** button

7. **Wait for processing** — you'll see a progress indicator:
   - "Enhancing image 1 of 3..."
   - "Enhancing image 2 of 3..."
   - "Enhancing image 3 of 3..."

8. **View the results** — each image thumbnail updates with the enhanced version

9. **Save the product** — the enhanced images will be saved with the product

---

## 14. Future Upgrade Options

### For Better Image-to-Image Quality

| Tool | Best For | Price | Notes |
|------|---------|-------|-------|
| **Stability AI (img2img)** | True pixel-level image editing | ~$0.03/image | Product stays most identical |
| **OpenAI GPT-4o Image Edit** | Complex editing instructions | ~$0.08/image | Best instruction understanding |
| **PhotoRoom API** | E-commerce product photography | $9/month | Purpose-built for product photos |
| **Clipdrop API** | Background removal + replacement | Free tier + paid | By Stability AI |
| **Remove.bg** | Pure background removal | 50 free/month | Can combine with other tools |

### Recommended Upgrade Path

```
Current:   Gemini 2.5 Flash Image (Free) ──► Good quality, free
                                               │
Phase 2:   Stability AI img2img (Paid) ────► Best image-to-image quality
           + Remove.bg for BG removal         Product stays pixel-perfect
                                               │
Phase 3:   PhotoRoom API (Paid) ───────────► Built for e-commerce
                                               One-stop solution
```

---

*Documentation generated for TijarFlow — AI Image Enhancement Feature*
*Last updated: April 6, 2026*
