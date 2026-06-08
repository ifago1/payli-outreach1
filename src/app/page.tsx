import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime, relativeAge } from "@/lib/utils";
import { CategoryBadge, StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [totals, recentLeads, lastSync, byCategory, byStatus] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.findMany({ orderBy: { registeredAt: "desc" }, take: 8 }),
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.lead.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Overzicht van nieuwe retail- en horeca-inschrijvingen vanuit het KVK Handelsregister.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/sync" className="btn-primary">
            Nieuwe sync starten
          </Link>
          <Link href="/leads" className="btn-secondary">
            Alle leads
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Totaal leads" value={totals} />
        <StatCard
          label="Retail"
          value={byCategory.find((c) => c.category === "retail")?._count._all ?? 0}
        />
        <StatCard
          label="Horeca"
          value={byCategory.find((c) => c.category === "horeca")?._count._all ?? 0}
        />
        <StatCard
          label="Logies"
          value={byCategory.find((c) => c.category === "hotel")?._count._all ?? 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Recent nieuw ingeschreven</h2>
            <Link href="/leads" className="text-sm text-brand-600 hover:underline">
              Alles bekijken →
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentLeads.map((lead) => (
                <li key={lead.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:text-brand-700 truncate block">
                      {lead.handelsnaam}
                    </Link>
                    <p className="text-xs text-slate-500 truncate">
                      {lead.sbiCode} · {lead.sbiDescription} · {lead.city}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <CategoryBadge category={lead.category} />
                    <span className="text-xs text-slate-500">{relativeAge(lead.ageDays)}</span>
                    <StatusBadge status={lead.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">Status pipeline</h2>
          <ul className="space-y-2 text-sm">
            {byStatus.length === 0 && <li className="text-slate-500">Nog geen data.</li>}
            {byStatus.map((s) => (
              <li key={s.status} className="flex items-center justify-between">
                <StatusBadge status={s.status} />
                <span className="font-medium text-slate-700">{s._count._all}</span>
              </li>
            ))}
          </ul>
          <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-700">Laatste sync</p>
            {lastSync ? (
              <>
                <p>{formatDateTime(lastSync.startedAt)} — {lastSync.status}</p>
                <p>
                  {lastSync.totalLeadsCreated} nieuw · {lastSync.totalLeadsUpdated} bijgewerkt ·{" "}
                  {lastSync.totalProfilesFetched} profielen
                </p>
              </>
            ) : (
              <p>Nog niet gesynct. Ga naar KVK-sync om te beginnen.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-10 text-sm text-slate-500">
      <p>Nog geen leads in de database.</p>
      <p className="mt-1">
        Ga naar <Link href="/sync" className="text-brand-600 hover:underline">KVK-sync</Link> om de eerste run te starten.
      </p>
    </div>
  );
}
