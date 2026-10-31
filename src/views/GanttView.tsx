import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, isToday, isWeekend, parseISO } from "date-fns";
import { isDone, taskKey, useStore } from "../store";
import type { Task } from "../lib/types";
import { isoDate, locale, todayIso } from "../lib/dates";
import { useTaskClick } from "../components/task/useTaskClick";
import { useT } from "../i18n";

const ROW_H = 36;
const ZOOMS = [16, 28, 44];

type Drag = { id: string; mode: "move" | "start" | "end"; x0: number; dx: number };

/**
 * Gantt-Diagramm: Balken von Start- bis Fälligkeitsdatum.
 * Balken ziehen = verschieben, Ränder ziehen = Dauer ändern.
 * Aufgaben ohne Datum: in die Zeitleiste klicken, um ein Datum zu setzen.
 */
export function GanttView({ tasks }: { tasks: Task[] }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const d = useStore((s) => s.data);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayW = ZOOMS[zoom];

  const list = useMemo(() => {
    const visible = tasks.filter((x) => !x.archived);
    const dated = visible
      .filter((x) => x.start_date || x.due_date)
      .sort((a, b) => (a.start_date ?? a.due_date!).localeCompare(b.start_date ?? b.due_date!));
    const undated = visible.filter((x) => !x.start_date && !x.due_date);
    return [...dated, ...undated];
  }, [tasks]);
  const click = useTaskClick(list.map((x) => x.id));

  // Zeitraum: 2 Wochen vor dem frühesten bis 4 Wochen nach dem spätesten Datum
  const { start, days } = useMemo(() => {
    const dates = list.flatMap((x) => [x.start_date, x.due_date]).filter(Boolean) as string[];
    dates.push(todayIso());
    dates.sort();
    const s = addDays(parseISO(dates[0]), -14);
    const e = addDays(parseISO(dates[dates.length - 1]), 28);
    return { start: s, days: eachDayOfInterval({ start: s, end: e }) };
  }, [list]);

  const offset = (iso: string) => differenceInCalendarDays(parseISO(iso), start);

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, offset(todayIso()) * dayW - el.clientWidth / 3);
  };
  useEffect(scrollToToday, [dayW]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ziehen der Balken
  useEffect(() => {
    if (!drag) return;
    let g: Drag = drag;
    const onMove = (e: PointerEvent) => {
      g = { ...g, dx: e.clientX - g.x0 };
      setDrag(g);
    };
    const onUp = () => {
      setDrag(null);
      {
        const shift = Math.round(g.dx / dayW);
        const task = list.find((x) => x.id === g.id);
        if (task && shift !== 0) {
          const s = task.start_date ?? task.due_date!;
          const e = task.due_date ?? task.start_date!;
          let ns = s;
          let ne = e;
          if (g.mode === "move") {
            ns = isoDate(addDays(parseISO(s), shift));
            ne = isoDate(addDays(parseISO(e), shift));
          } else if (g.mode === "start") {
            ns = isoDate(addDays(parseISO(s), shift));
            if (ns > e) ns = e;
          } else {
            ne = isoDate(addDays(parseISO(e), shift));
            if (ne < s) ne = s;
          }
          useStore.getState().updateTask(task.id, { start_date: ns, due_date: ne });
        }
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag?.id, dayW]); // eslint-disable-line react-hooks/exhaustive-deps

  const width = days.length * dayW;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-6 pt-4 pb-2">
        <button className="btn-ghost px-2 py-1 text-xs" onClick={scrollToToday}>
          {t("calendar.today")}
        </button>
        <div className="flex rounded-md border border-border">
          {[t("gantt.zoomOut"), t("gantt.zoomMid"), t("gantt.zoomIn")].map((label, i) => (
            <button
              key={i}
              onClick={() => setZoom(i)}
              className={`px-2 py-1 text-xs ${zoom === i ? "bg-accent font-medium " : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t("gantt.hint")}</span>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto border-t border-border">
        <div className="flex" style={{ width: width + 260 }}>
          {/* Linke Spalte mit Aufgabennamen */}
          <div className="sticky left-0 z-20 w-[260px] shrink-0 border-r border-border bg-background">
            <div className="sticky top-0 z-10 h-12 border-b border-border bg-background" />
            {list.map((x) => (
              <div
                key={x.id}
                style={{ height: ROW_H }}
                onClick={(e) => click.onClick(e, x.id)}
                onContextMenu={(e) => click.onContextMenu(e, x.id)}
                className="flex cursor-pointer items-center gap-2 truncate border-b border-border px-3 text-sm hover:bg-accent "
              >
                <span className="font-mono text-[11px] text-muted-foreground/70">{taskKey(x, d.projects)}</span>
                <span className={`truncate ${isDone(x, d.columns) ? "text-muted-foreground/70 line-through" : ""}`}>{x.title}</span>
              </div>
            ))}
          </div>

          {/* Zeitleiste */}
          <div className="relative" style={{ width }}>
            <div className="sticky top-0 z-10 flex h-12 border-b border-border bg-background">
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  style={{ width: dayW }}
                  className={`flex shrink-0 flex-col items-center justify-end pb-1 text-[10px] ${
                    isToday(day) ? "font-bold text-foreground" : "text-muted-foreground/70"
                  }`}
                >
                  {day.getDate() === 1 || day.getTime() === start.getTime() ? (
                    <span className="font-medium whitespace-nowrap text-foreground">
                      {format(day, "MMM", { locale: locale(lang) })}
                    </span>
                  ) : null}
                  {(dayW >= 28 || day.getDay() === 1) && format(day, "d")}
                </div>
              ))}
            </div>

            {/* Hintergrund: Wochenenden + Heute-Linie */}
            <div className="pointer-events-none absolute inset-x-0 top-12 bottom-0 flex">
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  style={{ width: dayW }}
                  className={`shrink-0 ${isWeekend(day) ? "bg-muted" : ""} ${
                    isToday(day) ? "border-x border-red-500/40" : ""
                  }`}
                />
              ))}
            </div>

            {list.map((x) => {
              const s = x.start_date ?? x.due_date;
              const e = x.due_date ?? x.start_date;
              const done = isDone(x, d.columns);
              const color = d.projects.find((p) => p.id === x.project_id)?.color ?? "#6366f1";
              let left = s ? offset(s) * dayW : 0;
              let w = s && e ? (offset(e) - offset(s) + 1) * dayW : 0;
              if (drag?.id === x.id) {
                const dx = Math.round(drag.dx / dayW) * dayW;
                if (drag.mode === "move") left += dx;
                if (drag.mode === "start") (left += Math.min(dx, w - dayW)), (w -= Math.min(dx, w - dayW));
                if (drag.mode === "end") w = Math.max(dayW, w + dx);
              }
              const startDrag = (mode: Drag["mode"]) => (ev: React.PointerEvent) => {
                ev.stopPropagation();
                ev.preventDefault();
                setDrag({ id: x.id, mode, x0: ev.clientX, dx: 0 });
              };
              return (
                <div
                  key={x.id}
                  style={{ height: ROW_H }}
                  className="relative border-b border-border"
                  onClick={(ev) => {
                    if (s) return;
                    // Aufgabe ohne Datum: Klick setzt Start = Ende = angeklickter Tag
                    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                    const day = isoDate(addDays(start, Math.floor((ev.clientX - rect.left) / dayW)));
                    useStore.getState().updateTask(x.id, { start_date: day, due_date: day });
                  }}
                >
                  {s ? (
                    <div
                      onPointerDown={startDrag("move")}
                      onDoubleClick={() => useStore.getState().set({ openTaskId: x.id })}
                      title={`${x.title}\n${s} → ${e}`}
                      className={`group absolute top-1.5 flex cursor-grab items-center overflow-hidden rounded-md text-xs font-medium text-white shadow-sm select-none active:cursor-grabbing ${
                        done ? "opacity-50" : ""
                      }`}
                      style={{ left, width: w, height: ROW_H - 12, backgroundColor: color }}
                    >
                      <span onPointerDown={startDrag("start")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-black/20" />
                      <span className="truncate px-2.5">{w > 40 ? x.title : ""}</span>
                      <span onPointerDown={startDrag("end")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-black/20" />
                    </div>
                  ) : (
                    <div className="flex h-full cursor-copy items-center hover:bg-accent">
                      <span className="sticky left-[272px] text-xs text-muted-foreground/70">
                      {t("gantt.noDate")}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {list.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t("common.noTasks")}</p>}
      </div>
    </div>
  );
}
