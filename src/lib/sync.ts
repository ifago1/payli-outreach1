import { prisma } from "@/lib/prisma";
import {
  getVestigingsprofiel,
  searchKvk,
  type KvkSearchParams,
  type KvkVestigingProfile,
} from "@/lib/kvk";
import { findTargetSbi, classifySbi } from "@/lib/sbi-codes";

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
// Vestigingsprofielen die we de afgelopen N dagen al hebben opgehaald
// hergebruiken we uit de database in plaats van opnieuw bij KVK aan te kloppen.
// Bespaart €0,02 per profiel — bij re-syncs van dezelfde regio gaat dat hard.
const PROFILE_CACHE_DAYS = Number(process.env.SYNC_PROFILE_CACHE_DAYS ?? 7);
// Vestigingen die we eerder hebben afgewezen (verkeerde SBI of te oud) cachen
// we N dagen lang — anders betalen we elke run opnieuw €0,02 per profiel om
// hetzelfde oordeel te vellen. Bedrijven veranderen zelden van SBI; 30 dagen
// is een veilige refresh-periode.
const REJECT_CACHE_DAYS = Number(process.env.SYNC_REJECT_CACHE_DAYS ?? 30);

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
  let profilesFromCache = 0;
  let profilesSkippedRejected = 0;
  let totalLeadsCreated = 0;
  let totalLeadsUpdated = 0;

  const cacheCutoff = new Date(Date.now() - PROFILE_CACHE_DAYS * 24 * 60 * 60 * 1000);
  const rejectCutoff = new Date(Date.now() - REJECT_CACHE_DAYS * 24 * 60 * 60 * 1000);

  try {
    for (const baseParams of options.searches) {
      if (totalProfilesFetched >= maxProfiles) break;

      let page = baseParams.pagina ?? 1;
      const pageSize = baseParams.aantal ?? 100;
      let totalForQuery = Infinity;

      while ((page - 1) * pageSize < totalForQuery && totalProfilesFetched < maxProfiles) {
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
          if (totalProfilesFetched >= maxProfiles) break;
          if (!item.vestigingsnummer) continue; // alleen vestigingen — geen losse rechtspersonen

          // Afwijzings-cache: hebben we deze vestiging eerder geëvalueerd én
          // niet relevant bevonden? Zo ja, sla 'm over zonder opnieuw €0,02
          // uit te geven. In testmodus negeren we deze cache ook — anders kun
          // je 'm nooit handmatig herevalueren.
          if (!ignoreFilters) {
            const rejected = await prisma.rejectedVestiging.findUnique({
              where: { vestigingsnummer: item.vestigingsnummer },
              select: { checkedAt: true },
            });
            if (rejected && rejected.checkedAt > rejectCutoff) {
              profilesSkippedRejected += 1;
              continue;
            }
          }

          // Cache-check: hebben we dit profiel recent al opgehaald? Zo ja,
          // hergebruiken we de opgeslagen JSON in plaats van een nieuwe €0,02-call.
          const cachedLead = await prisma.lead.findUnique({
            where: { vestigingsnummer: item.vestigingsnummer },
            select: { id: true, lastSyncedAt: true, rawProfileJson: true },
          });

          let profile: KvkVestigingProfile;
          if (
            cachedLead?.rawProfileJson &&
            cachedLead.lastSyncedAt &&
            cachedLead.lastSyncedAt > cacheCutoff
          ) {
            try {
              profile = JSON.parse(cachedLead.rawProfileJson) as KvkVestigingProfile;
              profilesFromCache += 1;
            } catch {
              // Corrupte cache — val terug op een verse call.
              try {
                profile = await getVestigingsprofiel(item.vestigingsnummer);
                totalProfilesFetched += 1;
              } catch (e) {
                errors.push(`vestigingsprofiel ${item.vestigingsnummer}: ${(e as Error).message}`);
                continue;
              }
            }
          } else {
            try {
              profile = await getVestigingsprofiel(item.vestigingsnummer);
              totalProfilesFetched += 1;
            } catch (e) {
              errors.push(`vestigingsprofiel ${item.vestigingsnummer}: ${(e as Error).message}`);
              continue;
            }
          }

          const sbiCodes = (profile.sbiActiviteiten ?? []).map((s) => s.sbiCode);
          const targetMatch = findTargetSbi(sbiCodes);
          const primarySbiForReject = profile.sbiActiviteiten?.find((s) => s.indHoofdactiviteit)?.sbiCode
            ?? sbiCodes[0]
            ?? null;

          const startDate = profile.materieleRegistratie?.datumAanvang
            ? new Date(profile.materieleRegistratie.datumAanvang)
            : profile.formeleRegistratiedatum
              ? new Date(profile.formeleRegistratiedatum)
              : null;

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

          if (cachedLead) {
            await prisma.lead.update({ where: { id: cachedLead.id }, data });
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
