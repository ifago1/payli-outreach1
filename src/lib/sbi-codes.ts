// SBI-codes (Standaard Bedrijfsindeling) relevant voor Payli's webshop + POS doelgroep.
// We targeten fysieke retail (47.*) en horeca (55.* + 56.*), excl. online-only retail (47.91/47.92).
// Bron: CBS SBI 2008 hoofd- en deelindeling.

export type SbiCategory = "retail" | "horeca" | "hotel" | "other";

export interface SbiEntry {
  code: string;
  description: string;
  category: SbiCategory;
}

// Whitelist van SBI-codes met fysieke locatie binnen retail en horeca.
// Codes zijn in KVK-formaat: meestal 4-5 cijfers (bv. "4711", "47111", "5610").
export const TARGET_SBI_CODES: SbiEntry[] = [
  // ───── Retail / Detailhandel (SBI 47) ─────
  // 47.1 Niet-gespecialiseerde winkels
  { code: "4711", description: "Supermarkten en dergelijke", category: "retail" },
  { code: "4719", description: "Warenhuizen / overige niet-gespecialiseerde winkels", category: "retail" },
  // 47.2 Voedings- en genotmiddelenwinkels
  { code: "4721", description: "Groente- en fruitwinkels", category: "retail" },
  { code: "4722", description: "Slagerijen en poeliers", category: "retail" },
  { code: "4723", description: "Visdetailhandel", category: "retail" },
  { code: "4724", description: "Brood- en banketwinkels, zoetwaren", category: "retail" },
  { code: "4725", description: "Slijterijen", category: "retail" },
  { code: "4726", description: "Tabakswinkels", category: "retail" },
  { code: "4729", description: "Overige gespecialiseerde voedingswinkels", category: "retail" },
  // 47.4 ICT-apparatuur
  { code: "4741", description: "Computers en randapparatuur", category: "retail" },
  { code: "4742", description: "Telecomwinkels", category: "retail" },
  { code: "4743", description: "Audio- en videoapparatuur", category: "retail" },
  // 47.5 Overige consumentenartikelen — woning
  { code: "4751", description: "Textielwinkels", category: "retail" },
  { code: "4752", description: "Bouwmarkten / doe-het-zelf", category: "retail" },
  { code: "4753", description: "Tapijten, vloeren, behang", category: "retail" },
  { code: "4754", description: "Elektrische huishoudelijke apparaten", category: "retail" },
  { code: "4759", description: "Meubel- en woninginrichtingswinkels", category: "retail" },
  // 47.6 Cultuur en recreatie
  { code: "4761", description: "Boekenwinkels", category: "retail" },
  { code: "4762", description: "Kranten en tijdschriften", category: "retail" },
  { code: "4763", description: "Cd's, dvd's, muziekinstrumenten", category: "retail" },
  { code: "4764", description: "Sportwinkels", category: "retail" },
  { code: "4765", description: "Spelletjes en speelgoed", category: "retail" },
  // 47.7 Overige goederen
  { code: "4771", description: "Kledingwinkels", category: "retail" },
  { code: "4772", description: "Schoenen- en lederwarenwinkels", category: "retail" },
  { code: "4773", description: "Apotheken", category: "retail" },
  { code: "4774", description: "Medische en orthopedische artikelen", category: "retail" },
  { code: "4775", description: "Drogisterijen, parfumerie, cosmetica", category: "retail" },
  { code: "4776", description: "Bloemen, planten, tuinartikelen, dieren", category: "retail" },
  { code: "4777", description: "Juweliers, uurwerken", category: "retail" },
  { code: "4778", description: "Overige winkels in nieuwe artikelen", category: "retail" },
  { code: "4779", description: "Winkels in tweedehands goederen", category: "retail" },
  // Bewust UITGESLOTEN: 47.91 postorder/internet, 47.92 markt-/straathandel, 47.99 overige verkoop n.e.g.

  // ───── Logies (SBI 55) ─────
  { code: "5510", description: "Hotels en pensions", category: "hotel" },
  { code: "5520", description: "Vakantiehuisjes, appartementen, B&B", category: "hotel" },
  { code: "5530", description: "Kampeerterreinen", category: "hotel" },
  { code: "5590", description: "Overige logiesverstrekking", category: "hotel" },

  // ───── Horeca / Eet- en drinkgelegenheden (SBI 56) ─────
  { code: "5610", description: "Restaurants, cafetaria's, snackbars, lunchrooms", category: "horeca" },
  { code: "56101", description: "Restaurants", category: "horeca" },
  { code: "56102", description: "Cafetaria's, lunchrooms, snackbars", category: "horeca" },
  { code: "5621", description: "Eventcatering", category: "horeca" },
  { code: "5629", description: "Kantines en contractcatering", category: "horeca" },
  { code: "5630", description: "Cafés en bars", category: "horeca" },
];

// Index voor snelle lookup
const SBI_INDEX: Map<string, SbiEntry> = new Map(
  TARGET_SBI_CODES.map((entry) => [entry.code, entry]),
);

/**
 * Classificeer een SBI-code naar onze interne categorie.
 * Match eerst exact, val terug op prefix-match (bv. "56101" → matched by "5610" entry).
 */
export function classifySbi(code: string | null | undefined): {
  category: SbiCategory;
  description: string | null;
} {
  if (!code) return { category: "other", description: null };
  const normalized = code.replace(/\D/g, "");

  const exact = SBI_INDEX.get(normalized);
  if (exact) return { category: exact.category, description: exact.description };

  // Prefix match — bv. "47111" → "4711"
  for (let len = Math.min(normalized.length, 5); len >= 2; len--) {
    const prefix = normalized.slice(0, len);
    const match = SBI_INDEX.get(prefix);
    if (match) return { category: match.category, description: match.description };
  }

  return { category: "other", description: null };
}

/**
 * Check of een lijst SBI-codes binnen onze target valt.
 * Retourneert de eerste matchende code (primaire activiteit) of null.
 */
export function findTargetSbi(codes: string[]): SbiEntry | null {
  for (const code of codes) {
    const normalized = code.replace(/\D/g, "");
    const match = SBI_INDEX.get(normalized);
    if (match) return match;
    // Prefix fallback
    for (let len = Math.min(normalized.length, 5); len >= 2; len--) {
      const prefix = normalized.slice(0, len);
      const prefixMatch = SBI_INDEX.get(prefix);
      if (prefixMatch) return prefixMatch;
    }
  }
  return null;
}

export const RETAIL_CODES = TARGET_SBI_CODES.filter((e) => e.category === "retail");
export const HORECA_CODES = TARGET_SBI_CODES.filter((e) => e.category === "horeca");
export const HOTEL_CODES = TARGET_SBI_CODES.filter((e) => e.category === "hotel");
