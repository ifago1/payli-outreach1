import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { SyncForm } from "@/components/SyncForm";
import { estimateSyncCost, formatCents } from "@/lib/kvk-pricing";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const runs = await prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
  const apiConfigured = !!process.env.KVK_API_KEY;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">KVK-sync</h1>
        <p className="text-sm text-slate-500">
          Haal vestigingen op uit het Handelsregister en filter automatisch op SBI (retail + horeca) en
          inschrijfdatum.
        </p>
      </div>

      {!apiConfigured && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">KVK API-sleutel ontbreekt</p>
          <p>
            Zet <code className="bg-amber-100 px-1 rounded">KVK_API_KEY</code> in je <code>.env</code> bestand
            (vraag een gratis test-key aan via{" "}
            <a className="underline" href="https://developers.kvk.nl" target="_blank" rel="noopener noreferrer">
              developers.kvk.nl
            </a>
            ). Een sync zal anders falen.
          </p>
        </div>
      )}

      <div className="card p-5">
        <SyncForm />
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-3">Recente syncs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen syncs uitgevoerd.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Gestart</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Trigger</th>
                  <th className="py-2 pr-4 font-medium">Profielen (overgeslagen)</th>
                  <th className="py-2 pr-4 font-medium">KVK-kosten</th>
                  <th className="py-2 pr-4 font-medium">Leads nieuw / update</th>
                  <th className="py-2 pr-4 font-medium">Foutmeldingen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => {
                  const errs = r.errors ? (JSON.parse(r.errors) as string[]) : [];
                  const cost = estimateSyncCost(r.totalProfilesFetched, r.profilesFromCache);
                  return (
                    <tr key={r.id}>
                      <td className="py-2 pr-4">{formatDateTime(r.startedAt)}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`badge ${
                            r.status === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : r.status === "failed"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{r.trigger}</td>
                      <td className="py-2 pr-4">
                        {r.totalProfilesFetched}
                        {(r.profilesFromCache > 0 || r.profilesSkippedRejected > 0) && (
                          <span className="text-slate-400">
                            {" "}
                            ({r.profilesFromCache > 0 && `${r.profilesFromCache} bekend`}
                            {r.profilesFromCache > 0 && r.profilesSkippedRejected > 0 && ", "}
                            {r.profilesSkippedRejected > 0 && `${r.profilesSkippedRejected} afgewezen`})
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-medium text-slate-700">
                        {formatCents(cost.cents)}
                        {(cost.savedCents > 0 || r.profilesSkippedRejected > 0) && (
                          <span className="block text-xs text-emerald-600 font-normal">
                            bespaard {formatCents(cost.savedCents + r.profilesSkippedRejected * 2)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {r.totalLeadsCreated} / {r.totalLeadsUpdated}
                      </td>
                      <td className="py-2 pr-4 text-rose-600">
                        {errs.length === 0 ? (
                          0
                        ) : (
                          <details className="cursor-pointer">
                            <summary className="select-none">{errs.length}</summary>
                            <ul className="mt-1 ml-2 list-disc text-xs text-rose-700 font-mono max-w-xl break-all">
                              {errs.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5 text-sm space-y-3">
        <h2 className="font-semibold text-slate-800">Achter de schermen</h2>
        <p className="text-slate-600">
          De KVK Zoeken-API levert <strong>geen direct SBI-filter</strong>. We pagineren daarom door
          zoekresultaten per plaats/postcode en halen vervolgens het{" "}
          <code className="bg-slate-100 px-1 rounded">vestigingsprofiel</code> op om de SBI-activiteiten en
          inschrijfdatum te controleren. Vestigingen die binnen onze retail/horeca-whitelist vallen én
          jonger zijn dan de gekozen window worden opgeslagen als lead.
        </p>
        <p className="text-slate-600">
          <strong>Kosten per call:</strong> Zoeken-API is gratis, elk vestigingsprofiel kost <strong>€ 0,02</strong>{" "}
          (plus € 6,40 vast per maand). Elk vestigingsnummer dat we al kennen — als lead óf als eerdere
          afwijzing — wordt <strong>permanent overgeslagen</strong>: we halen een profiel dus nooit twee keer op.
          Zo betaal je de € 0,02 precies één keer per vestiging, hoe vaak je dezelfde regio ook opnieuw scant.
        </p>
        <p className="text-slate-600">
          Voor échte dagelijkse nieuwe inschrijvingen op grote schaal heb je het{" "}
          <a
            className="text-brand-600 hover:underline"
            href="https://www.kvk.nl/producten-bestellen/handelsregister-bestanden/dataservice/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Handelsregister Dataservice
          </a>{" "}
          abonnement nodig. De codebase is voorbereid om dat later toe te voegen
          (zie <code>src/lib/sync.ts</code>).
        </p>
        <p className="text-slate-600">
          Voor cron-syncs is het endpoint <code className="bg-slate-100 px-1 rounded">POST /api/sync/cron</code>{" "}
          beschermd met header <code>x-cron-secret</code>. Configureer je scheduler (Vercel Cron / GitHub
          Actions / Railway) om dit periodiek aan te roepen.
        </p>
      </div>

      <p className="text-xs text-slate-500">
        Tip: gebruik de <Link href="/templates" className="text-brand-600 hover:underline">e-mailtemplates</Link>{" "}
        om je outreach te standaardiseren.
      </p>
    </div>
  );
}
