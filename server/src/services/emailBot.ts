// Email autoresponder bot. Polls the support inbox every N minutes,
// classifies each new message, drafts a reply via Gemini, logs the result.
// Sending is gated behind EMAIL_BOT_SEND_ENABLED (default false in phase 1).
//
// Env:
//   EMAIL_BOT_ENABLED       — master switch. Default false.
//   EMAIL_BOT_SEND_ENABLED  — actually send drafted replies. Default false.
//   EMAIL_BOT_INBOX         — which user/mailbox to poll. Default SMTP_USER.
//   EMAIL_BOT_INTERVAL_MS   — polling cadence. Default 300000 (5 min).
//   IMAP_HOST / IMAP_PORT   — IMAP server. Defaults to SMTP_HOST + 993.
//   SMTP_USER / SMTP_PASS   — reused as IMAP login. Same creds, same mailbox.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import { classify } from "./emailBotClassifier";
import { draftReply } from "./emailBotReply";

const prisma = new PrismaClient();

let pollingTimer: NodeJS.Timeout | null = null;
let pollInProgress = false;

function getConfig() {
  const enabled = (process.env.EMAIL_BOT_ENABLED || "false").toLowerCase() === "true";
  const sendEnabled = (process.env.EMAIL_BOT_SEND_ENABLED || "false").toLowerCase() === "true";
  const intervalMs = Math.max(60_000, Number(process.env.EMAIL_BOT_INTERVAL_MS || 300_000));
  const inbox = process.env.EMAIL_BOT_INBOX || process.env.SMTP_USER || "";
  const host = process.env.IMAP_HOST || process.env.SMTP_HOST || "";
  const port = Number(process.env.IMAP_PORT || 993);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  return { enabled, sendEnabled, intervalMs, inbox, host, port, user, pass };
}

async function pollOnce(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.enabled) return;
  if (!cfg.host || !cfg.user || !cfg.pass) {
    console.warn("[emailBot] missing IMAP credentials — skip poll");
    return;
  }
  if (pollInProgress) {
    console.log("[emailBot] previous poll still running, skipping this tick");
    return;
  }
  pollInProgress = true;

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 993,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // We track which UIDs we've already processed in our own DB. That keeps
      // us idempotent across restarts and means we don't have to mark messages
      // \\Seen on the server (which would change visible state for humans).
      const seen = await prisma.supportEmail.findMany({
        select: { imapUid: true },
        orderBy: { imapUid: "desc" },
        take: 5000,
      });
      const seenSet = new Set(seen.map((s) => s.imapUid));

      // Fetch envelopes for all messages — small payload, lets us decide which
      // bodies to actually pull.
      const envelopes: { uid: number }[] = [];
      for await (const msg of client.fetch("1:*", { uid: true, envelope: true })) {
        if (typeof msg.uid === "number") envelopes.push({ uid: msg.uid });
      }
      const newUids = envelopes
        .map((e) => e.uid)
        .filter((uid) => !seenSet.has(uid))
        .sort((a, b) => a - b);

      if (newUids.length === 0) {
        console.log("[emailBot] no new messages");
        return;
      }
      console.log(`[emailBot] found ${newUids.length} new message(s)`);

      for (const uid of newUids) {
        try {
          await processOne(client, uid, cfg.sendEnabled);
        } catch (err) {
          console.error(`[emailBot] processOne uid=${uid} failed:`, err);
          // Persist a row so we don't reprocess this message on the next tick
          try {
            await prisma.supportEmail.create({
              data: {
                imapUid: uid,
                fromAddress: "unknown",
                toAddress: cfg.inbox,
                receivedAt: new Date(),
                classifiedAction: "skipped",
                skippedReason: "process_error",
              },
            });
          } catch {
            // If the row already exists from a partial earlier write, ignore.
          }
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error("[emailBot] poll failed:", err);
  } finally {
    try {
      await client.logout();
    } catch {
      // best-effort
    }
    pollInProgress = false;
  }
}

async function processOne(
  client: ImapFlow,
  uid: number,
  sendEnabled: boolean,
): Promise<void> {
  const fetched = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
  if (!fetched || !fetched.source) {
    await prisma.supportEmail.create({
      data: {
        imapUid: uid,
        fromAddress: "unknown",
        toAddress: process.env.EMAIL_BOT_INBOX || process.env.SMTP_USER || "",
        receivedAt: new Date(),
        classifiedAction: "skipped",
        skippedReason: "fetch_no_source",
      },
    });
    return;
  }

  const parsed = await simpleParser(fetched.source);
  const fromHeader = parsed.from?.value?.[0];
  const fromAddress = (fromHeader?.address || "").toLowerCase().trim();
  const fromName = fromHeader?.name || null;
  const toAddress = (parsed.to as { value?: { address?: string }[] } | undefined)?.value?.[0]?.address
    || process.env.EMAIL_BOT_INBOX
    || process.env.SMTP_USER
    || "";
  const subject = parsed.subject || "";
  const bodyText = (parsed.text || parsed.html || "").slice(0, 20_000);
  const messageId = parsed.messageId || null;
  // mailparser's headerLines is an array of {key, line} — join the raw lines
  // so the classifier can grep for Auto-Submitted / Precedence etc.
  const rawHeaders = (parsed.headerLines || [])
    .map((h: { line?: string }) => h.line || "")
    .join("\n");
  const receivedAt = parsed.date ? new Date(parsed.date) : new Date();

  const result = classify({
    fromAddress,
    toAddress,
    subject,
    bodyText,
    rawHeaders,
  });

  let generatedReply: string | null = null;
  if (result.action === "auto_reply") {
    generatedReply = await draftReply({
      fromName,
      fromAddress,
      subject,
      bodyText,
      language: result.language,
    });
  }

  // Phase 1: log only. Phase 2: also send when EMAIL_BOT_SEND_ENABLED=true
  // and the action is auto_reply.
  let sentAt: Date | null = null;
  if (sendEnabled && result.action === "auto_reply" && generatedReply) {
    try {
      await sendReply({
        to: fromAddress,
        subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
        body: generatedReply,
        inReplyTo: messageId,
      });
      sentAt = new Date();
    } catch (err) {
      console.error(`[emailBot] send failed for uid=${uid}:`, err);
    }
  }

  await prisma.supportEmail.create({
    data: {
      imapUid: uid,
      messageId,
      threadId: messageId,
      fromAddress: fromAddress || "unknown",
      fromName,
      toAddress,
      subject,
      bodyText,
      receivedAt,
      language: result.language,
      classifiedAction: result.action,
      skippedReason: result.skippedReason || null,
      generatedReply,
      sentAt,
    },
  });
}

async function sendReply(params: {
  to: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("SMTP not configured");

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 20_000,
  });
  const from = process.env.SMTP_FROM || user;
  await transport.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.body,
    inReplyTo: params.inReplyTo || undefined,
    references: params.inReplyTo || undefined,
  });
}

export function startEmailBot(): void {
  const cfg = getConfig();
  if (!cfg.enabled) {
    console.log("[emailBot] EMAIL_BOT_ENABLED is false — bot is off");
    return;
  }
  console.log(
    `[emailBot] starting. inbox=${cfg.inbox} host=${cfg.host}:${cfg.port} interval=${cfg.intervalMs}ms send=${cfg.sendEnabled}`,
  );
  // Run once immediately, then on the interval. The first run also serves as
  // a smoke test of credentials/connectivity.
  pollOnce().catch((err) => console.error("[emailBot] initial poll failed:", err));
  pollingTimer = setInterval(() => {
    pollOnce().catch((err) => console.error("[emailBot] scheduled poll failed:", err));
  }, cfg.intervalMs);
}

export function stopEmailBot(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}
