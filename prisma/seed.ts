import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEMPLATES = [
  {
    name: "Webshop — Retail intro",
    audience: "retail",
    subject: "Webshop voor {{handelsnaam}}? Wij bouwen 'm in 1 week",
    body: `Beste ondernemer van {{handelsnaam}},

Gefeliciteerd met de start van jullie zaak in {{city}}! We zagen jullie inschrijving in het KVK Handelsregister ({{sbi}}) en wilden ons graag voorstellen.

Bij Payli bouwen we webshops + POS-systemen specifiek voor fysieke winkels zoals jullie. Eén systeem voor je kassa, voorraad en online verkoop — zonder duizenden euro's setup.

Heb je 15 minuten deze week voor een korte demo?

Met vriendelijke groet,
Het Payli-team`,
  },
  {
    name: "POS — Horeca intro",
    audience: "horeca",
    subject: "POS voor {{handelsnaam}} — snel, betrouwbaar, betaalbaar",
    body: `Hoi,

We zagen dat {{handelsnaam}} in {{city}} pas is gestart ({{sbi}}). Gefeliciteerd met de opening!

Payli levert POS-systemen voor horeca die de eerste maanden zo soepel mogelijk maken: tafelbeheer, splitsen, integratie met bestelapps en pinapparatuur. Klaar in een dag.

Kan ik je deze week even bellen voor een korte intro?

Groet,
Het Payli-team`,
  },
  {
    name: "Logies — Hotel/B&B intro",
    audience: "hotel",
    subject: "Boekings- en kassasysteem voor {{handelsnaam}}",
    body: `Beste {{handelsnaam}},

Welkom in het Handelsregister! We helpen logiesaccommodaties in heel Nederland met een betaal- en kassasysteem dat naadloos koppelt met hun boekingsplatform.

Mag ik je 15 minuten plannen voor een korte demo?

Vriendelijke groet,
Het Payli-team`,
  },
];

async function main() {
  for (const tpl of TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { name: tpl.name },
      create: tpl,
      update: { subject: tpl.subject, body: tpl.body, audience: tpl.audience },
    });
  }
  console.log(`Seeded ${TEMPLATES.length} e-mail templates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
