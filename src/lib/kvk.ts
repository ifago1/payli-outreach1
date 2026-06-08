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

async function kvkFetch<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  assertConfigured();
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { apikey: API_KEY, accept: "application/hal+json" },
    cache: "no-store",
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new KvkApiError(res.status, body);
  }
  return (await res.json()) as T;
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
