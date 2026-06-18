"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { estimateSyncCost, formatCents } from "@/lib/kvk-pricing";

export function SyncForm() {
  const router = useRouter();
  const [cities, setCities] = useState("Amsterdam, Rotterdam, Utrecht, Den Haag, Eindhoven");
  const [postalPrefixes, setPostalPrefixes] = useState("");
  const [names, setNames] = useState("");
  const [windowDays, setWindowDays] = useState("60");
  const [maxProfiles, setMaxProfiles] = useState("200");
  const [ignoreFilters, setIgnoreFilters] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<null | {
    totalSearched: number;
    totalProfilesFetched: number;
    profilesFromCache: number;
    profilesSkippedRejected: number;
    totalLeadsCreated: number;
    totalLeadsUpdated: number;
    errors: string[];
  }>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);

    const citiesList = cities
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const postalList = postalPrefixes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const namesList = names
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const searches = [
      ...citiesList.map((plaats) => ({ plaats })),
      ...postalList.map((postcode) => ({ postcode })),
      ...namesList.map((handelsnaam) => ({ handelsnaam })),
    ];

    if (searches.length === 0) {
      setError("Voeg minstens één plaats, postcode of naam toe.");
      setPending(false);
      return;
    }

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          searches,
          newWithinDays: Number(windowDays),
          maxProfiles: Number(maxProfiles),
          ignoreFilters,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync mislukt");
      setResult(data);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="font-semibold text-slate-800">Nieuwe sync starten</h2>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Plaatsen (komma-gescheiden)</label>
        <input
          className="input"
          value={cities}
          onChange={(e) => setCities(e.target.value)}
          placeholder="Amsterdam, Utrecht, …"
        />
        <p className="text-xs text-slate-500 mt-1">KVK Zoeken filtert per plaats. Lege lijst = geen plaatszoekopdracht.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Postcodes (komma-gescheiden, optioneel)</label>
        <input
          className="input"
          value={postalPrefixes}
          onChange={(e) => setPostalPrefixes(e.target.value)}
          placeholder="1011AA, 1012, …"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Zoek op naam (komma-gescheiden, optioneel)</label>
        <input
          className="input"
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder="bijv. test  (werkt tegen de KVK test-API)"
        />
        <p className="text-xs text-slate-500 mt-1">
          De KVK test-API reageert vooral op naam-zoekopdrachten. Gebruik <code>test</code> om de sandbox te
          proberen.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Max leeftijd inschrijving (dagen)</label>
          <input className="input" type="number" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Max profielen per run</label>
          <input className="input" type="number" value={maxProfiles} onChange={(e) => setMaxProfiles(e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">Beschermt tegen KVK API rate limits.</p>
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={ignoreFilters}
          onChange={(e) => setIgnoreFilters(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm">
          <span className="font-medium text-slate-700">Testmodus — negeer SBI- en leeftijdsfilter</span>
          <span className="block text-xs text-slate-500">
            Importeert elke gevonden vestiging, ook buiten retail/horeca. Gebruik dit om met de KVK test-API te
            verifiëren dat de pipeline werkt. Zet uit voor echte outreach.
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Bezig met syncen…" : "Start sync"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {result &&
        (() => {
          const cost = estimateSyncCost(result.totalProfilesFetched, result.profilesFromCache);
          return (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p className="font-medium">Sync klaar</p>
              <p>
                {result.totalLeadsCreated} nieuwe lead(s) · {result.totalLeadsUpdated} bijgewerkt ·{" "}
                {result.totalProfilesFetched} profielen opgehaald
                {result.profilesFromCache > 0 && <> · {result.profilesFromCache} al bekend als lead</>}
                {result.profilesSkippedRejected > 0 && (
                  <> · {result.profilesSkippedRejected} eerder afgewezen, overgeslagen</>
                )}
              </p>
              <p className="mt-1 text-emerald-900">
                KVK-kosten deze run: <strong>{formatCents(cost.cents)}</strong>{" "}
                <span className="text-emerald-700">
                  ({result.totalProfilesFetched} nieuwe profielen × € 0,02)
                </span>
                {(cost.savedCents > 0 || result.profilesSkippedRejected > 0) && (
                  <span className="text-emerald-700">
                    {" · bespaard "}
                    {formatCents(cost.savedCents + result.profilesSkippedRejected * 2)}
                    {" doordat "}
                    {result.profilesFromCache + result.profilesSkippedRejected} reeds bekende vestiging(en) zijn
                    overgeslagen
                  </span>
                )}
              </p>
              {result.errors.length > 0 && (
                <p className="text-amber-700 mt-1">
                  {result.errors.length} waarschuwing(en) — zie de tabel hieronder.
                </p>
              )}
            </div>
          );
        })()}
    </form>
  );
}
