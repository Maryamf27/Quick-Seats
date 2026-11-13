import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = env.SMTP_URL
      ? nodemailer.createTransport(env.SMTP_URL)
      : nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(env.SMTP_URL);
}

/**
 * Sends one email. When SMTP_URL is not configured the message is only logged (subject and
 * recipient, never the body), so local development and CI never need a mail server.
 */
export async function sendEmail(message: OutgoingEmail): Promise<void> {
  await getTransporter().sendMail({ from: env.EMAIL_FROM, ...message });
  if (!isEmailDeliveryConfigured()) {
    console.info("Email not sent (SMTP_URL is not configured)", {
      to: message.to,
      subject: message.subject,
    });
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
