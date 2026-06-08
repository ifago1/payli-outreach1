import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderTemplate, sendEmail } from "@/lib/email";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const contentType = req.headers.get("content-type") ?? "";
  let to: string | undefined;
  let subject: string | undefined;
  let body: string | undefined;
  let templateId: string | undefined;

  if (contentType.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, string>;
    to = j.to;
    subject = j.subject;
    body = j.body;
    templateId = j.templateId;
  } else {
    const form = await req.formData();
    to = form.get("to")?.toString();
    subject = form.get("subject")?.toString();
    body = form.get("body")?.toString();
    templateId = form.get("templateId")?.toString();
  }

  if (!to) return NextResponse.json({ error: "Geadresseerde verplicht" }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead niet gevonden" }, { status: 404 });

  let renderedSubject = subject ?? "";
  let renderedBody = body ?? "";

  if (templateId) {
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
    if (!tpl) return NextResponse.json({ error: "Template niet gevonden" }, { status: 404 });
    if (!renderedSubject) renderedSubject = renderTemplate(tpl.subject, lead);
    if (!renderedBody) renderedBody = renderTemplate(tpl.body, lead);
  }

  if (!renderedSubject || !renderedBody) {
    return NextResponse.json({ error: "Onderwerp en body verplicht (of selecteer een template)" }, { status: 400 });
  }

  const fromAddress = process.env.SMTP_FROM ?? "no-reply@example.com";
  const result = await sendEmail({ to, subject: renderedSubject, body: renderedBody, from: fromAddress });

  await prisma.emailLog.create({
    data: {
      leadId: lead.id,
      toAddress: to,
      fromAddress,
      subject: renderedSubject,
      body: renderedBody,
      templateId: templateId ?? null,
      status: result.ok ? "sent" : "failed",
      errorMsg: result.error ?? null,
    },
  });

  if (result.ok && lead.status === "NEW") {
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "CONTACTED", email: to } });
  } else if (result.ok && !lead.email) {
    await prisma.lead.update({ where: { id: lead.id }, data: { email: to } });
  }

  if (contentType.includes("application/json")) {
    return NextResponse.json({ ok: result.ok, error: result.error });
  }
  return NextResponse.redirect(new URL(`/leads/${params.id}`, req.url), 303);
}
