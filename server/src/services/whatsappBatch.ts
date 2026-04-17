/**
 * Debounced batch collector for inbound WhatsApp images.
 *
 * Each merchant can fire off multiple images in quick succession. Instead of
 * processing each one separately, we collect them in a 5s quiet-window: the
 * timer resets on every new image. Once the window elapses with no new image,
 * we invoke the processor with the full list.
 *
 * Keyed by phoneNumber. In-memory only — if PM2 restarts mid-window, the
 * partial batch is dropped and the user re-sends. That's an acceptable trade
 * for not needing Redis.
 */

const QUIET_WINDOW_MS = 5_000;

export interface PendingImage {
  imageId: string;
  receivedAt: number;
}

interface BatchState {
  phoneNumber: string;
  images: PendingImage[];
  timer: NodeJS.Timeout;
  processor: (phoneNumber: string, images: PendingImage[]) => Promise<void>;
}

const batches = new Map<string, BatchState>();

export function addImageToBatch(
  phoneNumber: string,
  imageId: string,
  processor: (phoneNumber: string, images: PendingImage[]) => Promise<void>,
): { batchSize: number; newBatch: boolean } {
  const existing = batches.get(phoneNumber);
  if (existing) {
    clearTimeout(existing.timer);
    existing.images.push({ imageId, receivedAt: Date.now() });
    existing.timer = setTimeout(() => flushBatch(phoneNumber), QUIET_WINDOW_MS);
    return { batchSize: existing.images.length, newBatch: false };
  }

  const state: BatchState = {
    phoneNumber,
    images: [{ imageId, receivedAt: Date.now() }],
    timer: setTimeout(() => flushBatch(phoneNumber), QUIET_WINDOW_MS),
    processor,
  };
  batches.set(phoneNumber, state);
  return { batchSize: 1, newBatch: true };
}

async function flushBatch(phoneNumber: string): Promise<void> {
  const state = batches.get(phoneNumber);
  if (!state) return;
  batches.delete(phoneNumber);
  try {
    await state.processor(state.phoneNumber, state.images);
  } catch (err) {
    console.error(`[WhatsAppBatch] flush failed for ${phoneNumber}:`, (err as Error)?.message || err);
  }
}

/** For testing / admin — drop pending batch without processing. */
export function cancelBatch(phoneNumber: string): void {
  const state = batches.get(phoneNumber);
  if (!state) return;
  clearTimeout(state.timer);
  batches.delete(phoneNumber);
}
