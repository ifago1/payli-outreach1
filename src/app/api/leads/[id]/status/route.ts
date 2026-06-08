import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  status: z
    .enum([
      "NEW",
      "ENRICHING",
      "TO_CONTACT",
      "CONTACTED",
      "IN_CONVERSATION",
      "PROPOSAL_SENT",
      "WON",
      "LOST",
      "DO_NOT_CONTACT",
    ])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  assignedTo: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const lead = await prisma.lead.update({ where: { id: params.id }, data: body.data });
  return NextResponse.json(lead);
}
