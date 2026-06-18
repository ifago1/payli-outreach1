import { prisma } from "@/lib/prisma";
import {
  getVestigingsprofiel,
  searchKvk,
  type KvkSearchParams,
  type KvkVestigingProfile,
} from "@/lib/kvk";
import { findTargetSbi, classifySbi } from "@/lib/sbi-codes";

/**
 * KVK geeft datums terug in YYYYMMDD-string-formaat (bv. "20060201"), niet
 * als ISO 8601. Dit normaliseert beide vormen naar een geldige Date, of geeft
 * null voor onbruikbare invoer (Prisma weigert "Invalid Date" op te slaan).
 */
function parseKvkDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // YYYYMMDD (8 cijfers, geen scheidingstekens) — KVK's standaardvorm.
  const ymd = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (ymd) {
    const d = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Val terug op standaard parsing voor ISO-achtige strings.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface SyncOptions {
  /** Steden en/of postcodes om te doorzoeken. Eén query per item. */
  searches: KvkSearchParams[];
  /** Alleen bedrijven jonger dan X dagen opslaan. Null = geen leeftijdfilter. */
  newWithinDays?: number | null;
  /** Max profielen per run (rate-limit guard). */
  maxProfiles?: number;
  /** Trigger label voor SyncRun. */
  trigger?: "manual" | "cron" | "import";
  /**
   * Testmodus: negeer de SBI-whitelist én het leeftijdsvenster en importeer
   * elke gevonden vestiging. Handig om tegen de KVK test-API de pipeline
   * end-to-end te verifiëren (de sandbox bevat geen echte nieuwe retail/horeca).
   */
  ignoreFilters?: boolean;
}

export interface SyncSummary {
  syncRunId: string;
  totalSearched: number;
  totalProfilesFetched: number;
  profilesFromCache: number;
  profilesSkippedRejected: number;
  totalLeadsCreated: number;
  totalLeadsUpdated: number;
  errors: string[];
}

const DEFAULT_WINDOW = Number(process.env.SYNC_NEW_BUSINESS_WINDOW_DAYS ?? 60);
const DEFAULT_MAX = Number(process.env.SYNC_MAX_PROFILES_PER_RUN ?? 200);

// Kernregel: een vestigingsnummer dat we al kennen — als lead OF als eerdere
// afwijzing — halen we NOOIT een tweede keer op. Het doel van de sync is het
// vinden van *nieuwe* inschrijvingen; een bedrijf dat we al beoordeeld hebben is
// per definitie niet nieuw. Zo betalen we de €0,02 profielkost precies één keer
// per vestiging, ongeacht hoe vaak we dezelfde regio opnieuw scannen.
//
// Een afwijzing "too-old" wordt alleen maar ouder, dus die hoeft nooit herzien.
// Wil je een vestiging tóch opnieuw beoordelen (bv. na een SBI-wijziging), draai
// dan een sync in testmodus — die negeert beide caches.

/**
 * Runt een sync: zoekt vestigingen, haalt vestigingsprofielen op, filtert
 * op SBI-target (retail/horeca/hotel) en op inschrijfdatum. Maakt of update Leads.
 *
 * Aanpak: KVK Zoeken levert geen SBI-filter. We pagineren door zoekresultaten
 * en filteren client-side. Dit kost API-calls — daarom een harde cap per run.
 */
export async function runSync(options: SyncOptions): Promise<SyncSummary> {
  const windowDays = options.newWithinDays ?? DEFAULT_WINDOW;
  const maxProfiles = options.maxProfiles ?? DEFAULT_MAX;
  const ignoreFilters = options.ignoreFilters ?? false;
  const errors: string[] = [];

  const run = await prisma.syncRun.create({
    data: {
      trigger: options.trigger ?? "manual",
      searchParams: JSON.stringify(options.searches),
      status: "running",
    },
  });

  let totalSearched = 0;
  let totalProfilesFetched = 0;
  let profileCallsAttempted = 0; // succesvol + mislukt — bepaalt de rate-limit cap
  let profilesFromCache = 0;
  let profilesSkippedRejected = 0;
  let totalLeadsCreated = 0;
  let totalLeadsUpdated = 0;
  // Circuit breaker: stopt de hele run als KVK-profielcalls structureel falen
  // (bv. ongeldige key of verkeerde base-URL). Voorkomt dat we door honderden
  // resultaten heen blijven hameren op een misconfiguratie.
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 15;

  try {
    searchLoop: for (const baseParams of options.searches) {
      if (profileCallsAttempted >= maxProfiles) break;

      let page = baseParams.pagina ?? 1;
      const pageSize = baseParams.aantal ?? 100;
      let totalForQuery = Infinity;

      while ((page - 1) * pageSize < totalForQuery && profileCallsAttempted < maxProfiles) {
        let searchResp;
        try {
          searchResp = await searchKvk({ ...baseParams, pagina: page, aantal: pageSize, type: baseParams.type ?? "hoofdvestiging" });
        } catch (e) {
          errors.push(`search ${JSON.stringify(baseParams)} pagina ${page}: ${(e as Error).message}`);
          break;
        }

        totalForQuery = searchResp.totaal;
        totalSearched += searchResp.resultaten.length;

        for (const item of searchResp.resultaten) {
          if (profileCallsAttempted >= maxProfiles) break;
          if (!item.vestigingsnummer) continue; // alleen vestigingen — geen losse rechtspersonen

          // Hebben we deze vestiging al eerder beoordeeld? Dan slaan we 'm over
          // ZONDER het profiel opnieuw op te halen — we betalen de €0,02 maar
          // één keer per vestiging. Testmodus negeert dit zodat je kunt
          // herevalueren. Beide checks parallel voor snelheid.
          if (!ignoreFilters) {
            const [existingLead, existingReject] = await Promise.all([
              prisma.lead.findUnique({
                where: { vestigingsnummer: item.vestigingsnummer },
                select: { id: true },
              }),
              prisma.rejectedVestiging.findUnique({
                where: { vestigingsnummer: item.vestigingsnummer },
                select: { vestigingsnummer: true },
              }),
            ]);
            if (existingLead) {
              // Al bekend als lead — niets te doen, geen KVK-call.
              profilesFromCache += 1;
              continue;
            }
            if (existingReject) {
              // Eerder afgewezen (verkeerde SBI of te oud) — overslaan.
              profilesSkippedRejected += 1;
              continue;
            }
          }

          // Onbekend vestigingsnummer: dít is het enige pad dat een KVK-call
          // (en dus €0,02) kost. Tel elke poging — ook mislukte tellen mee voor
          // de rate-limit cap en de KVK rate limits zelf.
          let profile: KvkVestigingProfile;
          profileCallsAttempted += 1;
          try {
            profile = await getVestigingsprofiel(item.vestigingsnummer);
            totalProfilesFetched += 1;
            consecutiveErrors = 0;
          } catch (e) {
            errors.push(`vestigingsprofiel ${item.vestigingsnummer}: ${(e as Error).message}`);
            consecutiveErrors += 1;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              errors.push(
                `Gestopt: ${MAX_CONSECUTIVE_ERRORS} opeenvolgende profielfouten. ` +
                  `Controleer KVK_API_KEY en KVK_API_BASE_URL (productie = https://api.kvk.nl/api/v2).`,
              );
              break searchLoop;
            }
            continue;
          }

          const sbiCodes = (profile.sbiActiviteiten ?? []).map((s) => s.sbiCode);
          const targetMatch = findTargetSbi(sbiCodes);
          const primarySbiForReject = profile.sbiActiviteiten?.find((s) => s.indHoofdactiviteit)?.sbiCode
            ?? sbiCodes[0]
            ?? null;

          // KVK levert datums als YYYYMMDD-string (bv. "20060201"), niet als
          // ISO. Direct new Date("20060201") geeft Invalid Date — Prisma weigert
          // die op te slaan. parseKvkDate normaliseert naar ISO.
          const startDate =
            parseKvkDate(profile.materieleRegistratie?.datumAanvang) ??
            parseKvkDate(profile.formeleRegistratiedatum);

          const ageDays = startDate
            ? Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          if (!targetMatch && !ignoreFilters) {
            // SBI valt buiten onze doelgroep — onthouden zodat we 'm bij een
            // volgende sync niet opnieuw oppikken (en betalen).
            await prisma.rejectedVestiging.upsert({
              where: { vestigingsnummer: profile.vestigingsnummer },
              create: {
                vestigingsnummer: profile.vestigingsnummer,
                kvkNumber: profile.kvkNummer,
                reason: "sbi-mismatch",
                sbiCode: primarySbiForReject,
                registeredAt: startDate,
              },
              update: {
                reason: "sbi-mismatch",
                sbiCode: primarySbiForReject,
                registeredAt: startDate,
                checkedAt: new Date(),
              },
            });
            continue;
          }

          if (!ignoreFilters && windowDays !== null && ageDays !== null && ageDays > windowDays) {
            // Wel de juiste SBI, maar inschrijving valt buiten ons "nieuw"-venster.
            await prisma.rejectedVestiging.upsert({
              where: { vestigingsnummer: profile.vestigingsnummer },
              create: {
                vestigingsnummer: profile.vestigingsnummer,
                kvkNumber: profile.kvkNummer,
                reason: "too-old",
                sbiCode: primarySbiForReject,
                registeredAt: startDate,
              },
              update: {
                reason: "too-old",
                sbiCode: primarySbiForReject,
                registeredAt: startDate,
                checkedAt: new Date(),
              },
            });
            continue;
          }

          const bezoek = (profile.adressen ?? []).find((a) => a.type === "bezoekadres") ?? profile.adressen?.[0];
          const primarySbi = profile.sbiActiviteiten?.find((s) => s.indHoofdactiviteit) ?? profile.sbiActiviteiten?.[0];
          const classified = classifySbi(primarySbi?.sbiCode ?? targetMatch?.code);

          const data = {
            kvkNumber: profile.kvkNummer,
            vestigingsnummer: profile.vestigingsnummer,
            isHoofdvestiging: profile.indHoofdvestiging ?? false,
            handelsnaam: profile.eersteHandelsnaam ?? item.handelsnaam,
            street: bezoek?.straatnaam ?? null,
            houseNumber: [bezoek?.huisnummer, bezoek?.huisletter].filter(Boolean).join("") || null,
            postalCode: bezoek?.postcode ?? null,
            city: bezoek?.plaats ?? null,
            country: bezoek?.land ?? "Nederland",
            website: profile.websites?.[0] ?? null,
            sbiCode: primarySbi?.sbiCode ?? targetMatch?.code ?? null,
            sbiDescription: primarySbi?.sbiOmschrijving ?? classified.description ?? targetMatch?.description ?? null,
            sbiCodesAll: sbiCodes.join(","),
            category: classified.category,
            registeredAt: startDate,
            ageDays,
            employees: profile.totaalWerkzamePersonen ?? null,
            rawProfileJson: JSON.stringify(profile),
            lastSyncedAt: new Date(),
            source: "kvk-zoeken-api",
          };

          // Normaal gesproken is dit een nieuwe vestiging (bestaande zijn
          // hierboven al overgeslagen). In testmodus kan 'ie al bestaan —
          // dan updaten we in plaats van te crashen op de unique-constraint.
          const existing = await prisma.lead.findUnique({
            where: { vestigingsnummer: profile.vestigingsnummer },
            select: { id: true },
          });
          if (existing) {
            await prisma.lead.update({ where: { id: existing.id }, data });
            totalLeadsUpdated += 1;
          } else {
            await prisma.lead.create({ data });
            totalLeadsCreated += 1;
          }
        }

        if (searchResp.resultaten.length < pageSize) break;
        page += 1;
      }
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        totalSearched,
        totalProfilesFetched,
        profilesFromCache,
        profilesSkippedRejected,
        totalLeadsCreated,
        totalLeadsUpdated,
        errors: errors.length ? JSON.stringify(errors) : null,
        status: "completed",
      },
    });
  } catch (e) {
    errors.push(`fatal: ${(e as Error).message}`);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        totalSearched,
        totalProfilesFetched,
        profilesFromCache,
        profilesSkippedRejected,
        totalLeadsCreated,
        totalLeadsUpdated,
        errors: JSON.stringify(errors),
        status: "failed",
      },
    });
  }

  return {
    syncRunId: run.id,
    totalSearched,
    totalProfilesFetched,
    profilesFromCache,
    profilesSkippedRejected,
    totalLeadsCreated,
    totalLeadsUpdated,
    errors,
  };
}
