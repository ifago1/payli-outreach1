import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATUS_BY_OUTCOME: Record<string, string> = {
  interested: "IN_CONVERSATION",
  callback: "CONTACTED",
  meeting_booked: "IN_CONVERSATION",
  not_interested: "LOST",
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const contentType = req.headers.get("content-type") ?? "";
  let outcome: string | undefined;
  let summary: string | undefined;
  let caller: string | undefined;

  if (contentType.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, string>;
    outcome = j.outcome;
    summary = j.summary;
    caller = j.caller;
  } else {
    const form = await req.formData();
    outcome = form.get("outcome")?.toString();
    summary = form.get("summary")?.toString();
    caller = form.get("caller")?.toString();
  }

  if (!outcome) return NextResponse.json({ error: "outcome verplicht" }, { status: 400 });

  await prisma.callLog.create({
    data: {
      leadId: params.id,
      outcome,
      summary: summary?.trim() || null,
      caller: caller?.trim() || null,
    },
  });

  // Update lead-status automatisch op basis van outcome.
  const nextStatus = STATUS_BY_OUTCOME[outcome];
  if (nextStatus) {
    await prisma.lead.update({ where: { id: params.id }, data: { status: nextStatus } });
  }

  if (contentType.includes("application/json")) return NextResponse.json({ ok: true });
  return NextResponse.redirect(new URL(`/leads/${params.id}`, req.url), 303);
}
