import { cn } from "@/lib/utils";
import { categoryLabel, statusLabel } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  ENRICHING: "bg-slate-100 text-slate-700",
  TO_CONTACT: "bg-amber-100 text-amber-700",
  CONTACTED: "bg-indigo-100 text-indigo-700",
  IN_CONVERSATION: "bg-purple-100 text-purple-700",
  PROPOSAL_SENT: "bg-cyan-100 text-cyan-700",
  WON: "bg-emerald-100 text-emerald-700",
  LOST: "bg-rose-100 text-rose-700",
  DO_NOT_CONTACT: "bg-slate-200 text-slate-700",
};

const CATEGORY_STYLES: Record<string, string> = {
  retail: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  horeca: "bg-orange-50 text-orange-700 border border-orange-200",
  hotel: "bg-sky-50 text-sky-700 border border-sky-200",
  other: "bg-slate-50 text-slate-700 border border-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={cn("badge", STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700")}>{statusLabel(status)}</span>;
}

export function CategoryBadge({ category }: { category: string }) {
  return <span className={cn("badge", CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other)}>{categoryLabel(category)}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    HIGH: "bg-rose-100 text-rose-700",
    MEDIUM: "bg-amber-100 text-amber-700",
    LOW: "bg-slate-100 text-slate-700",
  };
  return <span className={cn("badge", styles[priority] ?? styles.MEDIUM)}>{priority}</span>;
}
