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
}

export interface SyncSummary {
  syncRunId: string;
  totalSearched: number;
  totalProfilesFetched: number;
  totalLeadsCreated: number;
  totalLeadsUpdated: number;
  errors: string[];
}

const DEFAULT_WINDOW = Number(process.env.SYNC_NEW_BUSINESS_WINDOW_DAYS ?? 60);
const DEFAULT_MAX = Number(process.env.SYNC_MAX_PROFILES_PER_RUN ?? 200);

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
  let totalLeadsCreated = 0;
  let totalLeadsUpdated = 0;

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

          let profile: KvkVestigingProfile;
          try {
            profile = await getVestigingsprofiel(item.vestigingsnummer);
            totalProfilesFetched += 1;
          } catch (e) {
            errors.push(`vestigingsprofiel ${item.vestigingsnummer}: ${(e as Error).message}`);
            continue;
          }

          const sbiCodes = (profile.sbiActiviteiten ?? []).map((s) => s.sbiCode);
          const targetMatch = findTargetSbi(sbiCodes);
          if (!targetMatch) continue; // SBI valt buiten onze doelgroep

          const startDate = profile.materieleRegistratie?.datumAanvang
            ? new Date(profile.materieleRegistratie.datumAanvang)
            : profile.formeleRegistratiedatum
              ? new Date(profile.formeleRegistratiedatum)
              : null;

          const ageDays = startDate
            ? Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          if (windowDays !== null && ageDays !== null && ageDays > windowDays) continue;

          const bezoek = (profile.adressen ?? []).find((a) => a.type === "bezoekadres") ?? profile.adressen?.[0];
          const primarySbi = profile.sbiActiviteiten?.find((s) => s.indHoofdactiviteit) ?? profile.sbiActiviteiten?.[0];
          const classified = classifySbi(primarySbi?.sbiCode ?? targetMatch.code);

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
            sbiCode: primarySbi?.sbiCode ?? targetMatch.code,
            sbiDescription: primarySbi?.sbiOmschrijving ?? classified.description ?? targetMatch.description,
            sbiCodesAll: sbiCodes.join(","),
            category: classified.category,
            registeredAt: startDate,
            ageDays,
            employees: profile.totaalWerkzamePersonen ?? null,
            rawProfileJson: JSON.stringify(profile),
            lastSyncedAt: new Date(),
            source: "kvk-zoeken-api",
          };

          const existing = await prisma.lead.findUnique({ where: { vestigingsnummer: profile.vestigingsnummer } });
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
    totalLeadsCreated,
    totalLeadsUpdated,
    errors,
  };
}
