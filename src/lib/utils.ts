import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("nl-NL", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export function relativeAge(days: number | null | undefined): string {
  if (days === null || days === undefined) return "—";
  if (days < 1) return "vandaag";
  if (days === 1) return "1 dag";
  if (days < 30) return `${days} dagen`;
  if (days < 365) return `${Math.floor(days / 30)} mnd`;
  return `${(days / 365).toFixed(1)} jr`;
}

export function categoryLabel(cat: string): string {
  switch (cat) {
    case "retail":
      return "Retail";
    case "horeca":
      return "Horeca";
    case "hotel":
      return "Logies";
    default:
      return "Overig";
  }
}

export function statusLabel(s: string): string {
  switch (s) {
    case "NEW":
      return "Nieuw";
    case "ENRICHING":
      return "Verrijken";
    case "TO_CONTACT":
      return "Te benaderen";
    case "CONTACTED":
      return "Benaderd";
    case "IN_CONVERSATION":
      return "In gesprek";
    case "PROPOSAL_SENT":
      return "Voorstel verzonden";
    case "WON":
      return "Gewonnen";
    case "LOST":
      return "Verloren";
    case "DO_NOT_CONTACT":
      return "Niet benaderen";
    default:
      return s;
  }
}
