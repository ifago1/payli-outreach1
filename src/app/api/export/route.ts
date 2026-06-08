import { prisma } from "@/lib/prisma";

const COLUMNS = [
  "handelsnaam",
  "kvkNumber",
  "vestigingsnummer",
  "category",
  "sbiCode",
  "sbiDescription",
  "street",
  "houseNumber",
  "postalCode",
  "city",
  "website",
  "phone",
  "email",
  "registeredAt",
  "ageDays",
  "employees",
  "status",
  "priority",
] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const where: Record<string, unknown> = {};
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  const city = url.searchParams.get("city");
  const q = url.searchParams.get("q");
  const maxAgeDays = url.searchParams.get("maxAgeDays");
  if (category && category !== "all") where.category = category;
  if (status && status !== "all") where.status = status;
  if (city) where.city = { contains: city };
  if (q) {
    where.OR = [
      { handelsnaam: { contains: q } },
      { kvkNumber: { contains: q } },
      { vestigingsnummer: { contains: q } },
    ];
  }
  if (maxAgeDays) {
    const n = Number(maxAgeDays);
    if (!Number.isNaN(n)) where.ageDays = { lte: n };
  }

  const leads = await prisma.lead.findMany({ where, orderBy: { registeredAt: "desc" }, take: 5000 });

  const header = COLUMNS.join(",");
  const lines = leads.map((l) =>
    COLUMNS.map((c) => csvEscape((l as unknown as Record<string, unknown>)[c])).join(","),
  );
  const csv = [header, ...lines].join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payli-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
