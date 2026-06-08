// CLI sync script — uitvoeren met `npm run sync:kvk -- "Amsterdam,Rotterdam" [windowDays] [maxProfiles]`
import { runSync } from "../src/lib/sync";

async function main() {
  const citiesArg = process.argv[2] ?? "Amsterdam,Rotterdam,Utrecht,Den Haag,Eindhoven";
  const windowDays = Number(process.argv[3] ?? "60");
  const maxProfiles = Number(process.argv[4] ?? "200");

  const cities = citiesArg.split(",").map((s) => s.trim()).filter(Boolean);
  console.log(`Sync starten voor: ${cities.join(", ")} (window=${windowDays}d, max=${maxProfiles})`);

  const summary = await runSync({
    searches: cities.map((plaats) => ({ plaats })),
    newWithinDays: windowDays,
    maxProfiles,
    trigger: "manual",
  });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
