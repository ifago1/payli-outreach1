import nodemailer, { type Transporter } from "nodemailer";
import type { Lead } from "@prisma/client";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host) {
    // Fallback: JSON transport — schrijft niets echt, maar voorkomt crashes in dev.
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return transporter;
}

export function renderTemplate(template: string, lead: Lead): string {
  const map: Record<string, string> = {
    handelsnaam: lead.handelsnaam ?? "",
    city: lead.city ?? "",
    category:
      lead.category === "horeca"
        ? "horecazaak"
        : lead.category === "hotel"
          ? "logiesaccommodatie"
          : lead.category === "retail"
            ? "winkel"
            : "onderneming",
    firstName: "",
    website: lead.website ?? "",
    sbi: lead.sbiDescription ?? "",
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => map[key] ?? "");
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
  from?: string;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const from = args.from ?? process.env.SMTP_FROM ?? "no-reply@example.com";
  try {
    const info = await getTransporter().sendMail({
      from,
      to: args.to,
      subject: args.subject,
      text: args.body,
      html: args.body
        .split("\n")
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join(""),
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
