import { SignalHigh, SignalLow, SignalMedium, Siren, Minus, type LucideIcon } from "lucide-react";
import type { Priority } from "./types";
import type { Lang, TKey } from "../i18n";
import { daysUntil, formatShort } from "./dates";

export const PRIORITIES: { value: Priority; label: TKey; className: string; icon: LucideIcon; rank: number }[] = [
  { value: "none", label: "prio.none", className: "text-chip-icon", icon: Minus, rank: 0 },
  { value: "low", label: "prio.low", className: "text-priority-low", icon: SignalLow, rank: 1 },
  { value: "medium", label: "prio.medium", className: "text-priority-medium", icon: SignalMedium, rank: 2 },
  { value: "high", label: "prio.high", className: "text-priority-high", icon: SignalHigh, rank: 3 },
  { value: "urgent", label: "prio.urgent", className: "text-priority-urgent", icon: Siren, rank: 4 },
];

export function priorityInfo(p: Priority) {
  return PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[0];
}

export const COLORS = [
  "#71717a",
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#84cc16",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
];


/** Anzeige eines Fälligkeitsdatums inkl. Warnstufe. */
export function formatDue(due: string, lang: Lang) {
  const diff = daysUntil(due);
  const label =
    diff === 0
      ? lang === "de"
        ? "Heute"
        : "Today"
      : diff === 1
        ? lang === "de"
          ? "Morgen"
          : "Tomorrow"
        : diff === -1
          ? lang === "de"
            ? "Gestern"
            : "Yesterday"
          : formatShort(due, lang);
  return { label, overdue: diff < 0, soon: diff >= 0 && diff <= 2 };
}
