import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, relativeAge } from "@/lib/utils";
import { CategoryBadge, StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  category?: string;
  status?: string;
  city?: string;
  maxAgeDays?: string;
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const where: Record<string, unknown> = {};
  if (searchParams.category && searchParams.category !== "all") where.category = searchParams.category;
  if (searchParams.status && searchParams.status !== "all") where.status = searchParams.status;
  if (searchParams.city) where.city = { contains: searchParams.city };
  if (searchParams.q) {
    where.OR = [
      { handelsnaam: { contains: searchParams.q } },
      { kvkNumber: { contains: searchParams.q } },
      { vestigingsnummer: { contains: searchParams.q } },
    ];
  }
  if (searchParams.maxAgeDays) {
    const n = Number(searchParams.maxAgeDays);
    if (!Number.isNaN(n)) where.ageDays = { lte: n };
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ registeredAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const exportUrl = `/api/export?${new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => !!v) as [string, string][],
  ).toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">{leads.length} resultaten (max 200 per pagina)</p>
        </div>
        <div className="flex gap-2">
          <a href={exportUrl} className="btn-secondary">
            Export CSV
          </a>
          <Link href="/sync" className="btn-primary">
            Nieuwe sync
          </Link>
        </div>
      </div>

      <form method="get" className="card p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          name="q"
          placeholder="Zoek handelsnaam / KVK-nr"
          defaultValue={searchParams.q ?? ""}
          className="input md:col-span-2"
        />
        <select name="category" defaultValue={searchParams.category ?? "all"} className="input">
          <option value="all">Alle categorieën</option>
          <option value="retail">Retail</option>
          <option value="horeca">Horeca</option>
          <option value="hotel">Logies</option>
        </select>
        <select name="status" defaultValue={searchParams.status ?? "all"} className="input">
          <option value="all">Alle statussen</option>
          <option value="NEW">Nieuw</option>
          <option value="TO_CONTACT">Te benaderen</option>
          <option value="CONTACTED">Benaderd</option>
          <option value="IN_CONVERSATION">In gesprek</option>
          <option value="PROPOSAL_SENT">Voorstel verzonden</option>
          <option value="WON">Gewonnen</option>
          <option value="LOST">Verloren</option>
          <option value="DO_NOT_CONTACT">Niet benaderen</option>
        </select>
        <input
          name="city"
          placeholder="Plaats"
          defaultValue={searchParams.city ?? ""}
          className="input"
        />
        <input
          name="maxAgeDays"
          placeholder="Max leeftijd (dgn)"
          type="number"
          defaultValue={searchParams.maxAgeDays ?? ""}
          className="input"
        />
        <div className="md:col-span-5 flex gap-2 justify-end">
          <Link href="/leads" className="btn-ghost">
            Reset
          </Link>
          <button type="submit" className="btn-primary">
            Filter toepassen
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Handelsnaam</th>
              <th className="px-4 py-2 font-medium">Categorie</th>
              <th className="px-4 py-2 font-medium">SBI</th>
              <th className="px-4 py-2 font-medium">Plaats</th>
              <th className="px-4 py-2 font-medium">Ingeschreven</th>
              <th className="px-4 py-2 font-medium">Leeftijd</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Geen leads gevonden. Start een KVK-sync of pas je filters aan.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:text-brand-700">
                      {lead.handelsnaam}
                    </Link>
                    <div className="text-xs text-slate-500">
                      KVK {lead.kvkNumber} · vest. {lead.vestigingsnummer}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <CategoryBadge category={lead.category} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div>{lead.sbiCode}</div>
                    <div className="text-xs text-slate-500 max-w-[18ch] truncate" title={lead.sbiDescription ?? ""}>
                      {lead.sbiDescription}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{lead.city ?? "—"}</td>
                  <td className="px-4 py-2.5">{formatDate(lead.registeredAt)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{relativeAge(lead.ageDays)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={lead.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
