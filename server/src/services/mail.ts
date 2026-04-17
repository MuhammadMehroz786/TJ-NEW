/**
 * SMTP mailer. Currently used for WhatsApp OTP emails. Nodemailer + standard
 * SMTP — works with SiteGround/cPanel/Zoho/any SMTP host. Credentials come
 * from environment:
 *   SMTP_HOST, SMTP_PORT (defaults 465), SMTP_USER, SMTP_PASS, SMTP_FROM
 */

import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

function getTransport(): Transporter {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS missing)");
  }
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,      // true for 465 (implicit TLS), false for 587 (STARTTLS)
    auth: { user, pass },
  });
  return cached;
}

export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@tijarflow.com";
  const transport = getTransport();
  await transport.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}
