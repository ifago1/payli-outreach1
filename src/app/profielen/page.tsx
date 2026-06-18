import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, rejectionReasonLabel } from "@/lib/utils";
import { CategoryBadge } from "@/components/StatusBadge";
import { formatCents, COST_VESTIGINGSPROFIEL_CENTS } from "@/lib/kvk-pricing";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  status?: "all" | "lead" | "rejected";
  reason?: string;
  city?: string;
}

/**
 * Combineert Lead + RejectedVestiging tot één lijst van geëvalueerde profielen
 * — alles waar we een KVK-call voor hebben gedaan en dus voor hebben betaald.
 * Zo zie je in één blik wat je investering tot nu toe opleverde.
 */
export default async function ProfielenPage({ searchParams }: { searchParams: SearchParams }) {
  const status = searchParams.status ?? "all";
  const q = searchParams.q?.trim() || undefined;
  const reasonFilter = searchParams.reason && searchParams.reason !== "all" ? searchParams.reason : undefined;
  const cityFilter = searchParams.city?.trim() || undefined;

  // Tellingen — onafhankelijk van filters, voor de samenvatting bovenaan.
  const [leadsTotal, rejectedTotal] = await Promise.all([
    prisma.lead.count(),
    prisma.rejectedVestiging.count(),
  ]);
  const profilesTotal = leadsTotal + rejectedTotal;
  const totalSpendCents = profilesTotal * COST_VESTIGINGSPROFIEL_CENTS;

  // Lijst opbouwen volgens filters. Voor "rejected" alleen filteren op reason zin.
  const leadWhere: Record<string, unknown> = {};
  const rejectWhere: Record<string, unknown> = {};
  if (q) {
    leadWhere.OR = [
      { handelsnaam: { contains: q } },
      { kvkNumber: { contains: q } },
      { vestigingsnummer: { contains: q } },
    ];
    rejectWhere.OR = [
      { handelsnaam: { contains: q } },
      { kvkNumber: { contains: q } },
      { vestigingsnummer: { contains: q } },
    ];
  }
  if (cityFilter) {
    leadWhere.city = { contains: cityFilter };
    rejectWhere.city = { contains: cityFilter };
  }
  if (reasonFilter) {
    rejectWhere.reason = reasonFilter;
  }

  const includeLeads = status === "all" || status === "lead";
  const includeRejected = status === "all" || status === "rejected";

  const [leadRows, rejectedRows] = await Promise.all([
    includeLeads
      ? prisma.lead.findMany({
          where: leadWhere,
          orderBy: [{ lastSyncedAt: "desc" }],
          take: 200,
          select: {
            id: true,
            vestigingsnummer: true,
            kvkNumber: true,
            handelsnaam: true,
            city: true,
            category: true,
            sbiCode: true,
            sbiDescription: true,
            registeredAt: true,
            lastSyncedAt: true,
          },
        })
      : Promise.resolve([]),
    includeRejected
      ? prisma.rejectedVestiging.findMany({
          where: rejectWhere,
          orderBy: [{ checkedAt: "desc" }],
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  // Tot één lijst smelten en sorteren op meest recent geëvalueerd.
  type Row = {
    key: string;
    href: string | null;
    kind: "lead" | "rejected";
    handelsnaam: string;
    kvkNumber: string | null;
    vestigingsnummer: string;
    city: string | null;
    sbiCode: string | null;
    sbiDescription: string | null;
    registeredAt: Date | null;
    evaluatedAt: Date;
    category?: string;
    reason?: string;
  };

  const rows: Row[] = [
    ...leadRows.map((l) => ({
      key: `lead-${l.id}`,
      href: `/leads/${l.id}`,
      kind: "lead" as const,
      handelsnaam: l.handelsnaam,
      kvkNumber: l.kvkNumber,
      vestigingsnummer: l.vestigingsnummer,
      city: l.city,
      sbiCode: l.sbiCode,
      sbiDescription: l.sbiDescription,
      registeredAt: l.registeredAt,
      evaluatedAt: l.lastSyncedAt,
      category: l.category,
    })),
    ...rejectedRows.map((r) => ({
      key: `rej-${r.vestigingsnummer}`,
      href: null,
      kind: "rejected" as const,
      handelsnaam: r.handelsnaam ?? "—",
      kvkNumber: r.kvkNumber,
      vestigingsnummer: r.vestigingsnummer,
      city: r.city,
      sbiCode: r.sbiCode,
      sbiDescription: r.sbiDescription,
      registeredAt: r.registeredAt,
      evaluatedAt: r.checkedAt,
      reason: r.reason,
    })),
  ].sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Gesyncede profielen</h1>
        <p className="text-sm text-slate-500">
          Alle vestigingen waar we een KVK-profielcall voor hebben gedaan — zowel de geslaagde leads als de
          afgewezen vestigingen. Toekomstige syncs slaan deze allemaal over (geen dubbele kosten).
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Totaal opgehaald" value={profilesTotal.toString()} sub="profielen ooit gesynced" />
        <SummaryCard label="Leads" value={leadsTotal.toString()} sub="binnen retail / horeca" tone="emerald" />
        <SummaryCard
          label="Afgewezen"
          value={rejectedTotal.toString()}
          sub="buiten SBI of te oud"
          tone="slate"
        />
        <SummaryCard
          label="KVK-kosten tot nu toe"
          value={formatCents(totalSpendCents)}
          sub="€ 0,02 × opgehaald"
          tone="brand"
        />
      </div>

      <form method="get" className="card p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          name="q"
          placeholder="Zoek handelsnaam, KVK-nr of vestigingsnr"
          defaultValue={searchParams.q ?? ""}
          className="input md:col-span-2"
        />
        <select name="status" defaultValue={status} className="input">
          <option value="all">Alle profielen</option>
          <option value="lead">Alleen leads</option>
          <option value="rejected">Alleen afgewezen</option>
        </select>
        <select name="reason" defaultValue={searchParams.reason ?? "all"} className="input">
          <option value="all">Alle redenen</option>
          <option value="sbi-mismatch">Buiten SBI-doelgroep</option>
          <option value="too-old">Te oude inschrijving</option>
        </select>
        <input
          name="city"
          placeholder="Plaats"
          defaultValue={searchParams.city ?? ""}
          className="input"
        />
        <div className="md:col-span-5 flex gap-2 justify-end">
          <Link href="/profielen" className="btn-ghost">
            Reset
          </Link>
          <button type="submit" className="btn-primary">
            Filter toepassen
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">
          {rows.length} resultaten (max 200 per type)
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Handelsnaam</th>
              <th className="px-4 py-2 font-medium">Plaats</th>
              <th className="px-4 py-2 font-medium">SBI</th>
              <th className="px-4 py-2 font-medium">Ingeschreven</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Beoordeeld</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Nog geen profielen opgehaald. Start een{" "}
                  <Link href="/sync" className="text-brand-600 underline">
                    KVK-sync
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    {r.href ? (
                      <Link href={r.href} className="font-medium text-slate-800 hover:text-brand-700">
                        {r.handelsnaam}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-700">{r.handelsnaam}</span>
                    )}
                    <div className="text-xs text-slate-500">
                      KVK {r.kvkNumber ?? "—"} · vest. {r.vestigingsnummer}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{r.city ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div>{r.sbiCode ?? "—"}</div>
                    {r.sbiDescription && (
                      <div className="text-xs text-slate-500 max-w-[20ch] truncate" title={r.sbiDescription}>
                        {r.sbiDescription}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{formatDate(r.registeredAt)}</td>
                  <td className="px-4 py-2.5">
                    {r.kind === "lead" ? (
                      <CategoryBadge category={r.category ?? "other"} />
                    ) : (
                      <span className="badge bg-slate-100 text-slate-700" title={r.reason ?? ""}>
                        {rejectionReasonLabel(r.reason ?? "")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{formatDateTime(r.evaluatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "slate" | "emerald" | "brand";
}) {
  const styles: Record<string, string> = {
    slate: "text-slate-900",
    emerald: "text-emerald-700",
    brand: "text-brand-700",
  };
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold ${styles[tone]}`}>{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}
