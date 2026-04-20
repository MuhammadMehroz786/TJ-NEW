import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Shared helpers for writing enhanced images into the AI Studio storage tree
 * and registering them in the database. Used by BOTH the web AI Studio routes
 * and the WhatsApp bot so merchants see all their enhancements in one library.
 */

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function extFromMime(mimeType: string): string {
  return MIME_EXT[mimeType] || "png";
}

export async function saveBase64ToStorage(base64: string, relativePath: string): Promise<void> {
  const storageRoot = path.resolve(process.cwd(), "storage");
  const fullPath = path.join(storageRoot, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(base64, "base64"));
}

/**
 * Persist an enhanced image to the AI Studio library for a given user. Returns
 * the created AiStudioImage row so callers can use its id / imageUrl.
 *
 * The image is saved under `ai-studio/{userId}/{timestamp}-{uuid}.{ext}` — same
 * naming as the web `/enhance` endpoint, so gallery listing / signed-URL logic
 * doesn't need to know where it came from.
 *
 * Caller supplies `folderName` if they want the image filed into a named folder
 * (auto-created if missing). If omitted, the image is unfiled.
 */
export async function saveEnhancementToLibrary(
  prisma: PrismaClient,
  params: {
    userId: string;
    base64: string;
    mimeType: string;
    background: string;      // scene name or theme tag — shows in gallery search
    folderName?: string;     // e.g. "WhatsApp" — auto-created if missing
  },
): Promise<{ id: string; imagePath: string; imageUrl: string }> {
  const ext = extFromMime(params.mimeType);
  const randomId = crypto.randomUUID();
  const relativePath = path
    .join("ai-studio", params.userId, `${Date.now()}-${randomId}.${ext}`)
    .replaceAll("\\", "/");

  await saveBase64ToStorage(params.base64, relativePath);

  let folderId: string | null = null;
  if (params.folderName) {
    const existing = await prisma.aiStudioFolder.findUnique({
      where: { userId_name: { userId: params.userId, name: params.folderName } },
    });
    folderId = existing?.id ?? (
      await prisma.aiStudioFolder.create({
        data: { userId: params.userId, name: params.folderName },
      })
    ).id;
  }

  const record = await prisma.aiStudioImage.create({
    data: {
      userId: params.userId,
      folderId,
      imagePath: relativePath,
      imageUrl: `/media/${relativePath}`,
      background: params.background,
    },
    select: { id: true, imagePath: true, imageUrl: true },
  });
  return record;
}
