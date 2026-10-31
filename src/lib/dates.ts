import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import type { Lang } from "../i18n";

/** Datum als "YYYY-MM-DD" (lokale Zeit). */
export const isoDate = (d: Date) => format(d, "yyyy-MM-dd");
export const todayIso = () => isoDate(new Date());
export const parseDate = (s: string) => parseISO(s);
export const locale = (lang: Lang) => (lang === "de" ? de : enUS);

export function daysUntil(date: string) {
  return differenceInCalendarDays(parseISO(date), new Date());
}

export function formatShort(date: string, lang: Lang) {
  return format(parseISO(date), lang === "de" ? "d. MMM" : "MMM d", { locale: locale(lang) });
}

export function formatLong(date: string | number, lang: Lang) {
  const d = typeof date === "number" ? new Date(date) : parseISO(date);
  return format(d, lang === "de" ? "d. MMMM yyyy" : "MMMM d, yyyy", { locale: locale(lang) });
}

export function formatDateTime(ms: number, lang: Lang) {
  return format(new Date(ms), lang === "de" ? "d. MMM yyyy, HH:mm" : "MMM d, yyyy, h:mm a", {
    locale: locale(lang),
  });
}

// ---------- Wiederkehrende Aufgaben ----------

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";
export interface Recurrence {
  freq: Frequency;
  interval: number;
}

export function parseRecurrence(json: string | null): Recurrence | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Recurrence;
  } catch {
    return null;
  }
}

/** Verschiebt ein Datum um eine Wiederholung (z. B. +1 Woche). */
export function shiftDate(date: string, r: Recurrence): string {
  const d = parseISO(date);
  const n = Math.max(1, r.interval);
  const next =
    r.freq === "daily"
      ? addDays(d, n)
      : r.freq === "weekly"
        ? addWeeks(d, n)
        : r.freq === "monthly"
          ? addMonths(d, n)
          : addYears(d, n);
  return isoDate(next);
}

export const formatFileSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
