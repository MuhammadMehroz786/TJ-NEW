// Email-bot classifier. Decides whether the IMAP poller should:
//   - skip the message entirely (bounces, auto-replies, our own outbound, etc.)
//   - or route it to the Gemini reply drafter.
// Also detects message language by Arabic-script char ratio.

export type ClassifiedAction = "auto_reply" | "skipped";

export interface ClassifyInput {
  fromAddress: string;       // already lowercased + trimmed by caller
  toAddress: string;
  subject: string;
  bodyText: string;
  rawHeaders: string;        // full header block, lowercased
}

export interface ClassifyResult {
  action: ClassifiedAction;
  skippedReason?: string;
  language: "en" | "ar";
}

const INTERNAL_DOMAIN_RE = /@tijarflow\.com$/i;
const BOUNCE_SENDER_RE = /(mailer-daemon|mail.delivery.system|postmaster|no-?reply|noreply|do-?not-?reply)@/i;
const SUBJECT_BOUNCE_RE = /(undelivered|delivery (failed|status)|returning message to sender|mail delivery failed)/i;
const OUR_OUTBOUND_SUBJECT_RE = /^(your tijarflow (sign-up|admin sign-in) code|reset your tijarflow password|your tijarflow ai studio)/i;
// 6 consecutive digits anywhere = looks like a reply to one of our OTP emails
const OTP_BODY_RE = /\b\d{6}\b/;

export function detectLanguage(text: string): "en" | "ar" {
  if (!text) return "en";
  let arabic = 0;
  let total = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 0;
    // Arabic block + Arabic Supplement + Arabic Extended-A + Arabic Presentation Forms A/B
    if ((cp >= 0x0600 && cp <= 0x06ff) ||
        (cp >= 0x0750 && cp <= 0x077f) ||
        (cp >= 0x08a0 && cp <= 0x08ff) ||
        (cp >= 0xfb50 && cp <= 0xfdff) ||
        (cp >= 0xfe70 && cp <= 0xfeff)) {
      arabic++;
      total++;
    } else if (/\p{L}/u.test(ch)) {
      total++;
    }
  }
  if (total === 0) return "en";
  return arabic / total >= 0.3 ? "ar" : "en";
}

export function classify(input: ClassifyInput): ClassifyResult {
  const headers = input.rawHeaders.toLowerCase();
  const language = detectLanguage(`${input.subject} ${input.bodyText}`);

  // 1. Bounce / mailer-daemon — never reply
  if (BOUNCE_SENDER_RE.test(input.fromAddress)) {
    return { action: "skipped", skippedReason: "bounce_or_noreply_sender", language };
  }
  if (SUBJECT_BOUNCE_RE.test(input.subject)) {
    return { action: "skipped", skippedReason: "bounce_subject", language };
  }

  // 2. Internal-domain sender — never reply to our own mail
  if (INTERNAL_DOMAIN_RE.test(input.fromAddress)) {
    return { action: "skipped", skippedReason: "internal_domain", language };
  }

  // 3. Auto-reply / vacation responder headers — replying causes loops
  if (/^auto-submitted:\s*(?!no\b)/m.test(headers)) {
    return { action: "skipped", skippedReason: "auto_submitted_header", language };
  }
  if (/^precedence:\s*(bulk|list|junk|auto[_-]?reply)/m.test(headers)) {
    return { action: "skipped", skippedReason: "precedence_header", language };
  }
  if (/^x-auto-response-suppress:/m.test(headers)) {
    return { action: "skipped", skippedReason: "auto_response_suppress_header", language };
  }
  if (/^x-autoreply:|^x-autorespond:/m.test(headers)) {
    return { action: "skipped", skippedReason: "x_autoreply_header", language };
  }

  // 4. Our own outbound subject patterns — if it matches, it's a reply to one
  // of our system emails (signup OTP, admin code, etc.) not a support request.
  if (OUR_OUTBOUND_SUBJECT_RE.test(input.subject.replace(/^re:\s*/i, ""))) {
    return { action: "skipped", skippedReason: "reply_to_system_email", language };
  }

  // 5. OTP-pattern body — looks like the user pasted back a 6-digit code
  if (OTP_BODY_RE.test(input.bodyText)) {
    return { action: "skipped", skippedReason: "otp_pattern_body", language };
  }

  // 6. Empty / tiny body — nothing to act on
  if (input.bodyText.trim().length < 10) {
    return { action: "skipped", skippedReason: "body_too_short", language };
  }

  return { action: "auto_reply", language };
}
