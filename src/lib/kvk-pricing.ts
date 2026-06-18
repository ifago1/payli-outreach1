// KVK API prijslijst (zoals gepubliceerd op developers.kvk.nl).
// Bedragen in eurocenten zodat we geen floating-point fouten krijgen.

/** € 0,02 per vestigingsprofiel-call (categorie "Other APIs"). */
export const COST_VESTIGINGSPROFIEL_CENTS = 2;

/** € 0 per Zoeken-call. */
export const COST_ZOEKEN_CENTS = 0;

/** € 6,40 vaste maandelijkse abonnementskosten. */
export const SUBSCRIPTION_MONTHLY_CENTS = 640;

export interface SyncCostBreakdown {
  /** Werkelijk gemaakte KVK-kosten voor deze run, in euro's. */
  cents: number;
  /** Kosten die we bespaard hebben door cache-hits, in euro's. */
  savedCents: number;
}

export function estimateSyncCost(
  profilesFetched: number,
  profilesFromCache: number,
): SyncCostBreakdown {
  return {
    cents: profilesFetched * COST_VESTIGINGSPROFIEL_CENTS,
    savedCents: profilesFromCache * COST_VESTIGINGSPROFIEL_CENTS,
  };
}

export function formatCents(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
