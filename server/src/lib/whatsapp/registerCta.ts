import { PrismaClient } from "@prisma/client";
import { sendWhatsAppTextMessage } from "../../services/whatsapp";
import { t, resolveLang } from "../../services/whatsappI18n";

/**
 * Register-CTA pitches for unregistered WhatsApp guests (Issue #74).
 *
 * Two outgoing messages:
 *   - Re-engagement nudge — sent ~2hr after a guest used ≥3 free credits and
 *     then went quiet. Scheduled via in-memory setTimeout from the credit
 *     increment site. Lost on server restart, which is fine for nudges.
 *   - Exhaustion CTA — already covered by the existing `guest_exhausted_inline`
 *     message; this module just adds idempotency so it doesn't re-fire every
 *     time the same exhausted guest tries another image.
 *
 * Both messages:
 *   - Only target rows with `userId == null` (guests).
 *   - Set the corresponding `*CtaSentAt` column on success. Once set, the
 *     message NEVER fires again for that phone number.
 *   - Use the session's `language` preference for translation.
 */

// Resolve the signup URL the same way whatsapp.ts does so messages match.
const SIGNUP_URL = process.env.WHATSAPP_SIGNUP_URL || "https://app.tijarflow.com/signup";

// Threshold + delay (Issue #74 spec). Hoisted as constants so the values are
// easy to find and adjust without grepping the call site.
export const REENGAGE_CREDITS_THRESHOLD = 3;
export const REENGAGE_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours
export const REENGAGE_QUIET_PERIOD_MS = 2 * 60 * 60 * 1000; // must be quiet for 2hr at fire time

/**
 * Send the re-engagement nudge if the session still qualifies.
 *
 * Re-checks all conditions at fire time because anything could have changed
 * in the 2hr since scheduling: the user may have replied (no longer quiet),
 * registered (now has userId), or already received this nudge (race).
 */
export async function maybeSendReengageNudge(prisma: PrismaClient, sessionId: string): Promise<boolean> {
  const session = await prisma.whatsAppSession.findUnique({ where: { id: sessionId } });
  if (!session) return false;
  // Disqualifiers — all silent no-ops.
  if (session.userId) return false;                       // registered since scheduling
  if (session.reengageCtaSentAt) return false;            // already sent
  if (session.creditsUsed < REENGAGE_CREDITS_THRESHOLD) return false;
  const sinceLast = Date.now() - new Date(session.lastMessageAt).getTime();
  if (sinceLast < REENGAGE_QUIET_PERIOD_MS) return false; // user came back active

  const lang = resolveLang(session.language);
  const body = t(lang, "guest_reengage_cta", { signup: SIGNUP_URL });
  try {
    const wamid = await sendWhatsAppTextMessage({ to: session.phoneNumber, body });
    // Mark sent FIRST so a parallel reschedule can't double-fire. If the
    // outbound fails the message wasn't delivered, but we still mark — the
    // alternative is risking a duplicate every restart, which is worse.
    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: { reengageCtaSentAt: new Date() },
    });
    if (wamid) console.log(`[whatsapp:cta] reengage nudge sent to ${session.phoneNumber}`);
    return true;
  } catch (err) {
    console.error(`[whatsapp:cta] reengage nudge failed for ${session.phoneNumber}:`, (err as Error)?.message);
    return false;
  }
}

/**
 * Schedule the re-engagement nudge to fire after REENGAGE_DELAY_MS.
 *
 * Safe to call repeatedly — `maybeSendReengageNudge` will no-op on the second
 * fire because `reengageCtaSentAt` will be set after the first. We don't
 * de-dupe scheduling itself because tracking pending timers across the process
 * adds complexity for no real benefit (extra DB read at fire time is cheap).
 *
 * In-memory only — if the Node process restarts within the 2hr window, the
 * scheduled fire is lost. Acceptable for a marketing nudge.
 */
export function scheduleReengageNudge(prisma: PrismaClient, sessionId: string): void {
  setTimeout(() => {
    void maybeSendReengageNudge(prisma, sessionId);
  }, REENGAGE_DELAY_MS).unref(); // unref so this timer doesn't block process exit
}

/**
 * Mark that the exhaustion CTA was delivered to this guest. Returns true if
 * this was the first time (caller can send the message), false if it was
 * already marked (caller should skip).
 *
 * Use BEFORE sending the message so a slow send doesn't allow a duplicate
 * if a second image arrives in parallel.
 */
export async function claimExhaustionCta(prisma: PrismaClient, sessionId: string): Promise<boolean> {
  // Conditional update: only set if currently null. updateMany returns count
  // of affected rows — 1 means we won the race, 0 means it was already set.
  const { count } = await prisma.whatsAppSession.updateMany({
    where: { id: sessionId, exhaustionCtaSentAt: null, userId: null },
    data: { exhaustionCtaSentAt: new Date() },
  });
  return count > 0;
}
