import { useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useStore } from "../../store";
import { isoDate, locale } from "../../lib/dates";
import { Popover, usePopover } from "./Popover";
import { useT } from "../../i18n";

/**
 * Eigener Datumswähler im App-Design statt des System-Kalenders.
 * value: "YYYY-MM-DD" bzw. mit withTime "YYYY-MM-DDTHH:MM".
 */
export function DatePicker({
  value,
  onChange,
  withTime,
  variant = "input",
  placeholder,
  className = "",
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  withTime?: boolean;
  variant?: "input" | "ghost";
  placeholder?: string;
  className?: string;
}) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const pop = usePopover();
  const datePart = value ? value.slice(0, 10) : null;
  const timePart = withTime ? (value?.slice(11, 16) || "09:00") : "";
  const [month, setMonth] = useState(() => startOfMonth(datePart ? parseISO(datePart) : new Date()));
  const [time, setTime] = useState(timePart);

  const label = datePart
    ? format(parseISO(datePart), lang === "de" ? "d. MMM yyyy" : "MMM d, yyyy", { locale: locale(lang) }) + (withTime ? ` · ${timePart}` : "")
    : (placeholder ?? t("date.pick"));

  const emit = (day: string | null, tm = time) => onChange(day ? (withTime ? `${day}T${/^\d{2}:\d{2}$/.test(tm) ? tm : "09:00"}` : day) : null);
  const pick = (day: string | null) => {
    emit(day);
    pop.close();
  };

  const weekOpts = { weekStartsOn: 1 as const };
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), weekOpts), end: endOfWeek(endOfMonth(month), weekOpts) });
  const weekdays = days.slice(0, 7).map((d) => format(d, "EEEEEE", { locale: locale(lang) }));
  const today = new Date();

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          setMonth(startOfMonth(datePart ? parseISO(datePart) : new Date()));
          setTime(timePart);
          pop.open(e);
        }}
        className={`${variant === "ghost" ? "input-ghost" : "input"} group flex items-center gap-2 text-left ${className}`}
      >
        <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
        <span className={`min-w-0 flex-1 truncate ${datePart ? "" : "text-muted-foreground/70"}`}>{label}</span>
        {datePart && (
          <span
            role="button"
            title={t("common.clear")}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="hidden size-4 items-center justify-center rounded text-muted-foreground group-hover:flex hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
          </span>
        )}
      </button>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close} className="w-64 p-2">
          <div className="mb-2 flex items-center gap-1">
            <span className="flex-1 pl-1 text-[13px] font-medium capitalize">{format(month, "LLLL yyyy", { locale: locale(lang) })}</span>
            <button type="button" className="btn-icon size-6" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft className="size-3.5" />
            </button>
            <button type="button" className="btn-icon size-6" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
            {weekdays.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const selected = datePart && isSameDay(d, parseISO(datePart));
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => pick(isoDate(d))}
                  className={`flex h-8 cursor-pointer items-center justify-center rounded-md text-[13px] tabular-nums transition-colors ${
                    selected
                      ? "bg-primary font-medium text-primary-foreground"
                      : isToday(d)
                        ? "bg-accent font-semibold text-foreground"
                        : isSameMonth(d, month)
                          ? "text-foreground hover:bg-accent"
                          : "text-muted-foreground/50 hover:bg-accent"
                  }`}
                >
                  {format(d, "d")}
                </button>
              );
            })}
          </div>
          {withTime && (
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">{t("date.time")}</span>
              <input
                className="input h-7 w-20 text-center tabular-nums"
                value={time}
                placeholder="09:00"
                maxLength={5}
                onChange={(e) => setTime(e.target.value.replace(/[^\d:]/g, ""))}
                onBlur={() => datePart && emit(datePart)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && datePart) pick(datePart);
                }}
              />
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1 border-t border-border pt-2">
            <button type="button" className="chip cursor-pointer hover:bg-chip-hover" onClick={() => pick(isoDate(today))}>
              {t("filter.today")}
            </button>
            <button type="button" className="chip cursor-pointer hover:bg-chip-hover" onClick={() => pick(isoDate(addDays(today, 1)))}>
              {t("due.tomorrow")}
            </button>
            <button type="button" className="chip cursor-pointer hover:bg-chip-hover" onClick={() => pick(isoDate(addDays(today, 7)))}>
              {t("due.nextWeek")}
            </button>
            {datePart && (
              <button type="button" className="chip ml-auto cursor-pointer text-chip-muted hover:bg-chip-hover" onClick={() => pick(null)}>
                {t("due.remove")}
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
