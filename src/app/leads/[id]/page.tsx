import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, relativeAge } from "@/lib/utils";
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/StatusBadge";
import { LeadActions } from "@/components/LeadActions";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      notes: { orderBy: { createdAt: "desc" } },
      callLogs: { orderBy: { calledAt: "desc" } },
      emails: { orderBy: { sentAt: "desc" } },
    },
  });
  if (!lead) notFound();

  const templates = await prisma.emailTemplate.findMany({
    where: { OR: [{ audience: "any" }, { audience: lead.category }] },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 mb-1">
            <Link href="/leads" className="hover:underline">
              ← Terug naar leads
            </Link>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{lead.handelsnaam}</h1>
          <div className="mt-2 flex items-center gap-2">
            <CategoryBadge category={lead.category} />
            <StatusBadge status={lead.status} />
            <PriorityBadge priority={lead.priority} />
            <span className="text-sm text-slate-500">· {relativeAge(lead.ageDays)} oud</span>
          </div>
        </div>
        <LeadActions leadId={lead.id} currentStatus={lead.status} currentPriority={lead.priority} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 space-y-3 text-sm">
          <h2 className="font-semibold text-slate-800 mb-1">Bedrijfsgegevens</h2>
          <Field label="KVK-nummer" value={lead.kvkNumber} />
          <Field label="Vestigingsnummer" value={lead.vestigingsnummer} />
          <Field label="Hoofdvestiging" value={lead.isHoofdvestiging ? "Ja" : "Nee"} />
          <Field label="SBI-code" value={`${lead.sbiCode ?? "—"} — ${lead.sbiDescription ?? ""}`} />
          <Field label="Alle SBI-codes" value={lead.sbiCodesAll ?? "—"} />
          <Field label="Werkzame personen" value={lead.employees?.toString() ?? "—"} />
          <Field label="Ingeschreven" value={formatDate(lead.registeredAt)} />
        </div>

        <div className="card p-5 space-y-3 text-sm">
          <h2 className="font-semibold text-slate-800 mb-1">Adres & contact</h2>
          <Field
            label="Bezoekadres"
            value={[lead.street, lead.houseNumber].filter(Boolean).join(" ") || "—"}
          />
          <Field
            label="Postcode / plaats"
            value={[lead.postalCode, lead.city].filter(Boolean).join(" ") || "—"}
          />
          <Field label="Website" value={lead.website ?? "—"} link={lead.website ?? undefined} />
          <Field label="Telefoon" value={lead.phone ?? "—"} />
          <Field label="E-mail" value={lead.email ?? "—"} />
          <Field label="Laatste sync" value={formatDateTime(lead.lastSyncedAt)} />
        </div>

        <div className="card p-5 space-y-3 text-sm">
          <h2 className="font-semibold text-slate-800 mb-1">Activiteit</h2>
          <Field label="Notities" value={lead.notes.length.toString()} />
          <Field label="Belnotities" value={lead.callLogs.length.toString()} />
          <Field label="Verzonden e-mails" value={lead.emails.length.toString()} />
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Snelle KVK-link:
              <br />
              <a
                href={`https://www.kvk.nl/zoeken/?source=all&q=${lead.kvkNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline"
              >
                Open op kvk.nl ↗
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NotesPanel leadId={lead.id} notes={lead.notes} />
        <CallLogPanel leadId={lead.id} callLogs={lead.callLogs} />
      </div>

      <EmailPanel leadId={lead.id} templates={templates} email={lead.email} emails={lead.emails} />
    </div>
  );
}

function Field({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-slate-500 w-32 shrink-0">{label}</span>
      {link ? (
        <a className="text-brand-600 hover:underline break-all" href={link} target="_blank" rel="noopener noreferrer">
          {value}
        </a>
      ) : (
        <span className="text-slate-800 break-words">{value}</span>
      )}
    </div>
  );
}

function NotesPanel({
  leadId,
  notes,
}: {
  leadId: string;
  notes: { id: string; body: string; author: string | null; createdAt: Date }[];
}) {
  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-800 mb-3">Notities</h2>
      <form action={`/api/leads/${leadId}/notes`} method="post" className="space-y-2 mb-4">
        <textarea name="body" required rows={3} placeholder="Voeg een notitie toe…" className="input" />
        <div className="flex justify-end">
          <button className="btn-primary" type="submit">
            Notitie opslaan
          </button>
        </div>
      </form>
      <ul className="space-y-3">
        {notes.length === 0 && <li className="text-sm text-slate-500">Geen notities.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
            <p className="mt-1 text-xs text-slate-500">{formatDateTime(n.createdAt)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CallLogPanel({
  leadId,
  callLogs,
}: {
  leadId: string;
  callLogs: { id: string; outcome: string; summary: string | null; calledAt: Date; caller: string | null }[];
}) {
  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-800 mb-3">Belnotities</h2>
      <form action={`/api/leads/${leadId}/calls`} method="post" className="space-y-2 mb-4">
        <div className="grid grid-cols-2 gap-2">
          <select name="outcome" className="input" defaultValue="no_answer">
            <option value="no_answer">Niet opgenomen</option>
            <option value="callback">Terugbellen</option>
            <option value="interested">Geïnteresseerd</option>
            <option value="not_interested">Niet geïnteresseerd</option>
            <option value="meeting_booked">Afspraak ingepland</option>
          </select>
          <input name="caller" placeholder="Door wie?" className="input" />
        </div>
        <textarea name="summary" rows={2} placeholder="Korte samenvatting…" className="input" />
        <div className="flex justify-end">
          <button className="btn-primary" type="submit">
            Belnotitie opslaan
          </button>
        </div>
      </form>
      <ul className="space-y-3">
        {callLogs.length === 0 && <li className="text-sm text-slate-500">Geen belnotities.</li>}
        {callLogs.map((c) => (
          <li key={c.id} className="rounded-md bg-slate-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">{c.outcome.replace(/_/g, " ")}</span>
              <span className="text-xs text-slate-500">{formatDateTime(c.calledAt)}</span>
            </div>
            {c.summary && <p className="mt-1 whitespace-pre-wrap text-slate-700">{c.summary}</p>}
            {c.caller && <p className="mt-1 text-xs text-slate-500">door {c.caller}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmailPanel({
  leadId,
  templates,
  email,
  emails,
}: {
  leadId: string;
  templates: { id: string; name: string; subject: string; body: string }[];
  email: string | null;
  emails: { id: string; subject: string; status: string; sentAt: Date; toAddress: string }[];
}) {
  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-800 mb-3">E-mail verzenden</h2>
      {!email && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Deze lead heeft nog geen e-mailadres. Voeg er een toe of stuur via een ander kanaal.
        </p>
      )}
      <form action={`/api/leads/${leadId}/email`} method="post" className="space-y-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600">Template</label>
          <select name="templateId" className="input">
            <option value="">— Kies een template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="text-xs font-medium text-slate-600">Naar</label>
          <input name="to" defaultValue={email ?? ""} placeholder="naam@bedrijf.nl" className="input" required />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600">Onderwerp (laat leeg om template te gebruiken)</label>
          <input name="subject" className="input" />
          <label className="text-xs font-medium text-slate-600">Body (laat leeg om template te gebruiken)</label>
          <textarea name="body" rows={4} className="input" />
        </div>
        <div className="lg:col-span-2 flex justify-end">
          <button className="btn-primary" type="submit">
            Verstuur e-mail
          </button>
        </div>
      </form>

      <div className="mt-5">
        <h3 className="text-sm font-medium text-slate-700 mb-2">Verzendgeschiedenis</h3>
        <ul className="space-y-2 text-sm">
          {emails.length === 0 && <li className="text-slate-500">Nog geen e-mails verstuurd.</li>}
          {emails.map((e) => (
            <li key={e.id} className="rounded-md bg-slate-50 p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{e.subject}</p>
                <p className="text-xs text-slate-500">naar {e.toAddress} · {formatDateTime(e.sentAt)}</p>
              </div>
              <span className={`badge ${e.status === "sent" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {e.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
