/**
 * Debounced batch collector for inbound WhatsApp images.
 *
 * Each merchant can fire off multiple images in quick succession. We collect
 * them in a quiet-window that resets on every new image, then process the
 * full list together when no new image arrives for that long.
 *
 * Two windows by design:
 *  - SINGLE_WINDOW_MS (1.5s): used while the batch only has 1 image, so the
 *    common single-image case feels responsive instead of stalling on a 5s
 *    "is it broken?" wait.
 *  - MULTI_WINDOW_MS (5s): kicks in once a 2nd image arrives, giving the
 *    merchant plenty of time to keep dropping more without triggering the
 *    theme prompt early.
 *
 * Keyed by phoneNumber. In-memory only — if PM2 restarts mid-window, the
 * partial batch is dropped and the user re-sends. That's an acceptable trade
 * for not needing Redis.
 */

const SINGLE_WINDOW_MS = 1_500;
const MULTI_WINDOW_MS = 5_000;

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
    // Once a 2nd image arrives we extend to the longer window so the merchant
    // can keep adding photos without the theme prompt firing early.
    existing.timer = setTimeout(() => flushBatch(phoneNumber), MULTI_WINDOW_MS);
    return { batchSize: existing.images.length, newBatch: false };
  }

  const state: BatchState = {
    phoneNumber,
    images: [{ imageId, receivedAt: Date.now() }],
    // Short window for the single-image case so the most common path feels
    // immediate. If a 2nd image arrives within 1.5s the if-branch above will
    // upgrade the timer to MULTI_WINDOW_MS.
    timer: setTimeout(() => flushBatch(phoneNumber), SINGLE_WINDOW_MS),
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
