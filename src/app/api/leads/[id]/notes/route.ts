import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const contentType = req.headers.get("content-type") ?? "";
  let body: string | undefined;
  let author: string | undefined;

  if (contentType.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as { body?: string; author?: string };
    body = j.body;
    author = j.author;
  } else {
    const form = await req.formData();
    body = form.get("body")?.toString();
    author = form.get("author")?.toString();
  }

  if (!body || !body.trim()) {
    return NextResponse.json({ error: "Body verplicht" }, { status: 400 });
  }

  await prisma.note.create({ data: { leadId: params.id, body: body.trim(), author: author ?? null } });

  if (contentType.includes("application/json")) return NextResponse.json({ ok: true });
  return NextResponse.redirect(new URL(`/leads/${params.id}`, req.url), 303);
}
