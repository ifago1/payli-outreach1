# Payli Outreach

Outreach-platform voor Payli's webshop + POS-oplossing. Haalt nieuwe vestigingen uit het KVK
Handelsregister op, filtert op fysieke retail (SBI 47.*) en horeca (SBI 55/56.*), en biedt een
dashboard om leads te benaderen via e-mail en telefoon.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** + **SQLite** (eenvoudig naar Postgres te switchen — pas `provider` aan in `prisma/schema.prisma`)
- **Tailwind CSS**
- **Nodemailer** voor outbound e-mail (SMTP — werkt met Resend/Postmark/SendGrid/Mailgun)
- **KVK Zoeken + Vestigingsprofiel API** (test- of productieomgeving)

## Snelstart

```bash
# 1. Dependencies installeren
npm install

# 2. .env aanmaken
cp .env.example .env
# Vul KVK_API_KEY in (test-key gratis via https://developers.kvk.nl)

# 3. Database initialiseren
npm run db:push
npm run db:seed

# 4. Dev server starten
npm run dev
# Open http://localhost:3000
```

## Belangrijke endpoints

| Pad                      | Functie                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `/`                      | Dashboard met KPI's en recente leads                                    |
| `/leads`                 | Lijst van leads met filters (categorie, status, plaats, leeftijd) + CSV |
| `/leads/[id]`            | Detailpagina met notities, belnotities, e-mail verzenden                |
| `/templates`             | Beheer van e-mailtemplates (merge fields)                               |
| `/sync`                  | Sync-form + geschiedenis                                                |
| `POST /api/sync`         | Programmatic sync trigger                                               |
| `POST /api/sync/cron`    | Cron endpoint (header `x-cron-secret`)                                  |
| `GET  /api/export`       | CSV-export van gefilterde leads                                         |

## SBI-doelgroep

Standaard whitelist staat in `src/lib/sbi-codes.ts`. Bevat:

- **Retail (SBI 47.x)** — supermarkten, kleding, schoenen, drogist, juweliers, boeken, sport, etc.
  Bewust uitgesloten: 47.91 (postorder/internet) en 47.92 (markt/straathandel).
- **Horeca (SBI 56.x)** — restaurants, cafetaria's, catering, cafés/bars.
- **Logies (SBI 55.x)** — hotels, B&B, vakantiehuisjes, kampeerterreinen.

Pas de lijst aan voor jouw segmentatie.

## KVK-architectuur — waarom 2 calls per lead?

De KVK Zoeken-API ondersteunt **geen SBI-filter** op zoekparameter-niveau. Werkwijze:

1. Zoek per plaats / postcode (paginatie, max 100 resultaten per pagina).
2. Voor elk resultaat het **vestigingsprofiel** ophalen → bevat SBI-activiteiten + materiële
   registratiedatum.
3. Client-side filter op:
   - SBI valt binnen onze whitelist
   - Inschrijving binnen `SYNC_NEW_BUSINESS_WINDOW_DAYS` (default 60 dagen)
4. Lead aanmaken of bijwerken (unique key = vestigingsnummer).

Voor productie-gebruik: overweeg het **[KVK Handelsregister Dataservice](https://www.kvk.nl/producten-bestellen/handelsregister-bestanden/dataservice/)**
abonnement, dat directe mutatiebestanden levert (inclusief SBI). De codebase is voorbereid om
een import-pad voor dataservice-bestanden toe te voegen — zie `src/lib/sync.ts`.

## Cron / scheduled syncs

Stel je scheduler (Vercel Cron, GitHub Actions, Railway scheduled jobs, EasyCron) in op:

```
POST https://jouwdomain/api/sync/cron
Header: x-cron-secret: <SYNC_CRON_SECRET>
```

Standaard scant de cron de 10 grootste steden. Pas aan via `CRON_CITIES=Amsterdam,Utrecht,…`.

## E-mail verzenden

Vul de SMTP-variabelen in `.env`. Zonder SMTP-config draait alles in
**dev-mode** (Nodemailer JSON-transport — e-mails worden niet écht verstuurd, maar wel gelogd).
Aanbevolen providers:

- **Resend** — smtp.resend.com (gemakkelijkste setup voor transactional)
- **Postmark** — sterke deliverability voor outbound sales
- **SendGrid / Mailgun** — als je een hoger volume verwacht

## Volgende stappen (suggesties)

- [ ] **HR Dataservice koppeling** voor échte dagelijkse nieuwe inschrijvingen
- [ ] **Lead scoring** (bv. werkzame personen, SBI gewicht, postcode-kwaliteit)
- [ ] **E-mail open/click tracking** (pixel + redirect-links)
- [ ] **Auth + multi-user** (bv. NextAuth.js met Google SSO voor sales team)
- [ ] **Inbound webhooks** voor reply-detection (vanuit Postmark/Resend)
- [ ] **Postgres + pgvector** voor semantic search op handelsnamen
