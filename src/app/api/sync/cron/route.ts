import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

// Standaard plaatsen om periodiek te scannen. Pas aan via env CRON_CITIES.
const DEFAULT_CITIES = "Amsterdam,Rotterdam,Utrecht,Den Haag,Eindhoven,Groningen,Tilburg,Almere,Breda,Nijmegen";

export async function POST(req: Request) {
  const secret = process.env.SYNC_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "SYNC_CRON_SECRET not configured" }, { status: 500 });
  const provided = req.headers.get("x-cron-secret");
  if (provided !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const citiesEnv = process.env.CRON_CITIES ?? DEFAULT_CITIES;
  const cities = citiesEnv.split(",").map((s) => s.trim()).filter(Boolean);

  const summary = await runSync({
    searches: cities.map((plaats) => ({ plaats })),
    trigger: "cron",
  });
  return NextResponse.json(summary);
}

// Ook GET ondersteunen voor scheduler-services die enkel GET kunnen.
export const GET = POST;
