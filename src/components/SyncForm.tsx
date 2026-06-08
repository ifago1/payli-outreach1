"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncForm() {
  const router = useRouter();
  const [cities, setCities] = useState("Amsterdam, Rotterdam, Utrecht, Den Haag, Eindhoven");
  const [postalPrefixes, setPostalPrefixes] = useState("");
  const [windowDays, setWindowDays] = useState("60");
  const [maxProfiles, setMaxProfiles] = useState("200");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<null | {
    totalSearched: number;
    totalProfilesFetched: number;
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

    const searches = [
      ...citiesList.map((plaats) => ({ plaats })),
      ...postalList.map((postcode) => ({ postcode })),
    ];

    if (searches.length === 0) {
      setError("Voeg minstens één plaats of postcode toe.");
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

      <div className="flex justify-end">
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Bezig met syncen…" : "Start sync"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="font-medium">Sync klaar</p>
          <p>
            {result.totalLeadsCreated} nieuwe lead(s) · {result.totalLeadsUpdated} bijgewerkt ·{" "}
            {result.totalProfilesFetched} profielen opgehaald
          </p>
          {result.errors.length > 0 && <p className="text-amber-700 mt-1">{result.errors.length} waarschuwing(en) — zie de tabel hieronder.</p>}
        </div>
      )}
    </form>
  );
}
