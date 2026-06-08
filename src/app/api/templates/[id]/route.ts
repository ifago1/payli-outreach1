import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(1).optional(),
  audience: z.enum(["any", "retail", "horeca", "hotel"]).optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const updated = await prisma.emailTemplate.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await prisma.emailTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
