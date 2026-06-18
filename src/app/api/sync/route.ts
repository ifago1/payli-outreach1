import { NextResponse } from "next/server";
import { z } from "zod";
import { runSync } from "@/lib/sync";

const searchSchema = z.object({
  handelsnaam: z.string().optional(),
  plaats: z.string().optional(),
  postcode: z.string().optional(),
  straatnaam: z.string().optional(),
  type: z.enum(["hoofdvestiging", "nevenvestiging", "rechtspersoon"]).optional(),
});

const bodySchema = z.object({
  searches: z.array(searchSchema).min(1),
  newWithinDays: z.number().int().positive().nullable().optional(),
  maxProfiles: z.number().int().positive().max(2000).optional(),
  ignoreFilters: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const summary = await runSync({
      searches: parsed.data.searches,
      newWithinDays: parsed.data.newWithinDays ?? undefined,
      maxProfiles: parsed.data.maxProfiles,
      ignoreFilters: parsed.data.ignoreFilters,
      trigger: "manual",
    });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
