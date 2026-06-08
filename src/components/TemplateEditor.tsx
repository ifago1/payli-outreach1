"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Template {
  id: string;
  name: string;
  audience: string;
  subject: string;
  body: string;
}

export function TemplateEditor({ initialTemplates }: { initialTemplates: Template[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<Template | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startNew() {
    setEditing({ id: "", name: "", audience: "any", subject: "", body: "" });
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(editing.id ? `/api/templates/${editing.id}` : "/api/templates", {
        method: editing.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Opslaan mislukt");
      // Refresh lokaal
      if (editing.id) {
        setTemplates((prev) => prev.map((t) => (t.id === editing.id ? data : t)));
      } else {
        setTemplates((prev) => [data, ...prev]);
      }
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Template verwijderen?")) return;
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Templates</h2>
          <button className="btn-primary" onClick={startNew}>
            + Nieuwe template
          </button>
        </div>
        <ul className="space-y-2">
          {templates.length === 0 && <li className="text-sm text-slate-500">Nog geen templates.</li>}
          {templates.map((t) => (
            <li
              key={t.id}
              className="rounded-md border border-slate-200 p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800 truncate">{t.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {t.audience} · {t.subject}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button className="btn-secondary" onClick={() => setEditing(t)}>
                  Bewerken
                </button>
                <button className="btn-ghost text-rose-600 hover:bg-rose-50" onClick={() => remove(t.id)}>
                  Verwijder
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-3">
          {editing ? (editing.id ? "Template bewerken" : "Nieuwe template") : "Selecteer of maak een template"}
        </h2>
        {editing ? (
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Naam</label>
              <input
                className="input"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Doelgroep</label>
              <select
                className="input"
                value={editing.audience}
                onChange={(e) => setEditing({ ...editing, audience: e.target.value })}
              >
                <option value="any">Alle categorieën</option>
                <option value="retail">Retail</option>
                <option value="horeca">Horeca</option>
                <option value="hotel">Logies</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Onderwerp</label>
              <input
                className="input"
                value={editing.subject}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Body</label>
              <textarea
                className="input font-mono text-sm"
                rows={12}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                required
              />
            </div>
            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                Annuleer
              </button>
              <button className="btn-primary" type="submit" disabled={pending}>
                {pending ? "Opslaan…" : "Opslaan"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">
            Klik op <em>+ Nieuwe template</em> of selecteer een bestaande template om te bewerken.
          </p>
        )}
      </div>
    </div>
  );
}
