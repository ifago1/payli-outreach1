// KVK API client — werkt tegen zowel de test- als productie-omgeving.
// Test base URL: https://api.kvk.nl/test/api/v2
// Productie:     https://api.kvk.nl/api/v2
// Vereist API-key via header `apikey`. Aanvragen via https://developers.kvk.nl.

const BASE_URL = process.env.KVK_API_BASE_URL ?? "https://api.kvk.nl/test/api/v2";
const API_KEY = process.env.KVK_API_KEY ?? "";

export interface KvkSearchParams {
  handelsnaam?: string;
  kvkNummer?: string;
  straatnaam?: string;
  plaats?: string;
  postcode?: string;
  type?: "hoofdvestiging" | "nevenvestiging" | "rechtspersoon";
  inclusiefInactieveRegistraties?: boolean;
  pagina?: number; // 1-based
  aantal?: number; // max 100
}

export interface KvkSearchResultItem {
  kvkNummer: string;
  vestigingsnummer?: string;
  handelsnaam: string;
  type: string; // "hoofdvestiging" | "nevenvestiging" | "rechtspersoon"
  adres?: {
    binnenlandsAdres?: {
      type?: string;
      straatnaam?: string;
      huisnummer?: number;
      huisletter?: string;
      postbusnummer?: number;
      postcode?: string;
      plaats?: string;
    };
    buitenlandsAdres?: { land?: string; plaats?: string };
  };
  links?: { rel: string; href: string }[];
}

export interface KvkSearchResponse {
  pagina: number;
  resultatenPerPagina: number;
  totaal: number;
  resultaten: KvkSearchResultItem[];
}

export interface KvkVestigingProfile {
  vestigingsnummer: string;
  kvkNummer: string;
  rsin?: string;
  formeleRegistratiedatum?: string; // ISO date
  materieleRegistratie?: { datumAanvang?: string; datumEinde?: string };
  eersteHandelsnaam?: string;
  totaalWerkzamePersonen?: number;
  fulltimeWerkzamePersonen?: number;
  parttimeWerkzamePersonen?: number;
  indHoofdvestiging?: boolean;
  indCommercieleVestiging?: string;
  voortzettingsId?: string;
  deeltijdwerkers?: number;
  websites?: string[];
  sbiActiviteiten?: { sbiCode: string; sbiOmschrijving: string; indHoofdactiviteit: boolean }[];
  adressen?: {
    type: string; // "bezoekadres" | "correspondentieadres"
    indAfgeschermd?: string;
    volledigAdres?: string;
    straatnaam?: string;
    huisnummer?: number;
    huisletter?: string;
    postcode?: string;
    plaats?: string;
    land?: string;
  }[];
  handelsnamen?: { naam: string; volgorde?: number }[];
}

export interface KvkBasisprofiel {
  kvkNummer: string;
  indNonMailing?: string;
  formeleRegistratiedatum?: string;
  materieleRegistratie?: { datumAanvang?: string; datumEinde?: string };
  statutaireNaam?: string;
  totaalWerkzamePersonen?: number;
  sbiActiviteiten?: { sbiCode: string; sbiOmschrijving: string; indHoofdactiviteit: boolean }[];
  _embedded?: {
    hoofdvestiging?: KvkVestigingProfile;
    eigenaar?: unknown;
  };
}

export class KvkApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `KVK API error (${status})`);
    this.status = status;
    this.body = body;
  }
}

function assertConfigured(): void {
  if (!API_KEY) {
    throw new Error(
      "KVK_API_KEY ontbreekt. Vraag een test- of productiesleutel aan via https://developers.kvk.nl en zet hem in .env.",
    );
  }
}

const MAX_RETRIES = Number(process.env.KVK_MAX_RETRIES ?? 3);
const REQUEST_TIMEOUT_MS = Number(process.env.KVK_REQUEST_TIMEOUT_MS ?? 20000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Maakt de echte oorzaak van een `fetch failed` leesbaar (ECONNRESET, timeout, TLS…). */
function describeFetchError(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: unknown };
  if (err?.name === "TimeoutError") return `timeout na ${REQUEST_TIMEOUT_MS}ms`;
  const cause = err?.cause as { code?: string; message?: string } | undefined;
  if (cause?.code) return `${err.message} (${cause.code})`;
  if (cause?.message) return `${err.message} (${cause.message})`;
  return err?.message ?? String(e);
}

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}

async function kvkFetch<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  assertConfigured();
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  let lastError: KvkApiError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponentiële backoff: 0,5s · 1s · 2s. Geeft een gereset keep-alive
      // socket of een rate-limit de tijd om te herstellen.
      await sleep(500 * 2 ** (attempt - 1));
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { apikey: API_KEY, accept: "application/hal+json" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      // Netwerkfout (fetch failed / timeout / connection reset). Vaak een
      // hergebruikte keep-alive verbinding die de server heeft gesloten —
      // een nieuwe poging opent een verse socket en slaagt meestal.
      lastError = new KvkApiError(0, null, `netwerkfout: ${describeFetchError(e)}`);
      continue;
    }

    // 429 (rate limit) en 5xx zijn tijdelijk → opnieuw proberen.
    if (res.status === 429 || res.status >= 500) {
      lastError = new KvkApiError(res.status, await readBody(res));
      continue;
    }

    // Andere 4xx (401/403/404) zijn permanent → meteen falen, geen retry.
    if (!res.ok) {
      throw new KvkApiError(res.status, await readBody(res));
    }

    return (await res.json()) as T;
  }

  throw lastError ?? new KvkApiError(0, null, "onbekende fout");
}

/**
 * Zoek vestigingen/rechtspersonen in het Handelsregister.
 * Let op: SBI is geen direct queryparameter — daarom filteren we client-side
 * via de basisprofielen/vestigingsprofielen.
 */
export function searchKvk(params: KvkSearchParams): Promise<KvkSearchResponse> {
  // KVK Zoeken API v2 verwacht `naam` (niet `handelsnaam`) en
  // `resultatenPerPagina` (niet `aantal`). Onze interne types houden de
  // vriendelijke namen aan; we vertalen alleen op de API-boundary.
  return kvkFetch<KvkSearchResponse>("/zoeken", {
    naam: params.handelsnaam,
    kvkNummer: params.kvkNummer,
    straatnaam: params.straatnaam,
    plaats: params.plaats,
    postcode: params.postcode,
    type: params.type,
    inclusiefInactieveRegistraties: params.inclusiefInactieveRegistraties,
    pagina: params.pagina ?? 1,
    resultatenPerPagina: params.aantal ?? 100,
  });
}

export function getBasisprofiel(kvkNummer: string): Promise<KvkBasisprofiel> {
  return kvkFetch<KvkBasisprofiel>(`/basisprofielen/${encodeURIComponent(kvkNummer)}`);
}

export function getVestigingsprofiel(vestigingsnummer: string): Promise<KvkVestigingProfile> {
  return kvkFetch<KvkVestigingProfile>(`/vestigingsprofielen/${encodeURIComponent(vestigingsnummer)}`);
}

/** Helper: bouwt een leesbaar adres uit een zoekresultaat. */
export function formatSearchAddress(item: KvkSearchResultItem): string {
  const a = item.adres?.binnenlandsAdres;
  if (!a) return item.adres?.buitenlandsAdres?.plaats ?? "";
  const street = [a.straatnaam, a.huisnummer, a.huisletter].filter(Boolean).join(" ");
  return [street, a.postcode, a.plaats].filter(Boolean).join(", ");
}
