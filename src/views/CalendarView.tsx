import { useState } from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { isDone, useStore } from "../store";
import type { Task } from "../lib/types";
import { isoDate, locale } from "../lib/dates";
import { priorityInfo } from "../lib/priority";
import { useTaskClick } from "../components/task/useTaskClick";
import { useT } from "../i18n";

/** Monatskalender: Aufgaben am Fälligkeitstag. Aufgaben lassen sich auf andere Tage ziehen. */
export function CalendarView({ projectId, tasks }: { projectId?: string; tasks: Task[] }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const weekOpts = { weekStartsOn: 1 as const };
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), weekOpts),
    end: endOfWeek(endOfMonth(month), weekOpts),
  });
  const dated = tasks.filter((x) => x.due_date && !x.archived);
  const click = useTaskClick(dated.map((x) => x.id));
  const weekdays = days.slice(0, 7).map((d) => format(d, "EEEEEE", { locale: locale(lang) }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const day = String(over.id);
    const task = tasks.find((x) => x.id === active.id);
    if (!task || !task.due_date || task.due_date === day) return;
    // Startdatum mitverschieben, damit die Dauer gleich bleibt
    let start = task.start_date;
    if (start) start = isoDate(addDays(parseISO(start), differenceInCalendarDays(parseISO(day), parseISO(task.due_date))));
    useStore.getState().updateTask(task.id, { due_date: day, start_date: start });
  };

  const activeTask = dated.find((x) => x.id === activeId);

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="w-48 text-lg font-semibold capitalize">{format(month, "LLLL yyyy", { locale: locale(lang) })}</h2>
        <button className="btn-icon" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={16} />
        </button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setMonth(startOfMonth(new Date()))}>
          {t("calendar.today")}
        </button>
        <button className="btn-icon" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-border text-xs font-medium text-muted-foreground ">
        {weekdays.map((w) => (
          <div key={w} className="px-2 py-1.5">
            {w}
          </div>
        ))}
      </div>
      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 border-l border-border">
          {days.map((day) => {
            const iso = isoDate(day);
            return (
              <Day key={iso} iso={iso} day={day} inMonth={isSameMonth(day, month)} onAdd={() => useStore.getState().set({ newTaskFor: { projectId, due: iso } })}>
                {dated
                  .filter((x) => x.due_date === iso)
                  .map((x) => (
                    <CalendarItem
                      key={x.id}
                      task={x}
                      onClick={(e) => click.onClick(e, x.id)}
                      onContextMenu={(e) => click.onContextMenu(e, x.id)}
                    />
                  ))}
              </Day>
            );
          })}
        </div>
        <DragOverlay>{activeTask && <ItemView task={activeTask} />}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Day({ iso, day, inMonth, onAdd, children }: { iso: string; day: Date; inMonth: boolean; onAdd: () => void; children: React.ReactNode }) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  return (
    <div
      ref={setNodeRef}
      className={`group flex min-h-0 flex-col gap-1 overflow-hidden border-r border-b border-border p-1 ${
        inMonth ? "" : "bg-muted text-muted-foreground/60"
      } ${isOver ? "bg-board-card-selected" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday(day) ? "bg-primary font-semibold text-primary-foreground" : ""}`}>
          {format(day, "d")}
        </span>
        <button className="btn-icon h-5 w-5 opacity-0 group-hover:opacity-100" title={t("common.newTask")} onClick={onAdd}>
          <Plus size={12} />
        </button>
      </div>
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function CalendarItem({ task, onClick, onContextMenu }: { task: Task; onClick: (e: React.MouseEvent) => void; onContextMenu: (e: React.MouseEvent) => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onClick} onContextMenu={onContextMenu} className={isDragging ? "opacity-40" : ""}>
      <ItemView task={task} />
    </div>
  );
}

function ItemView({ task }: { task: Task }) {
  const columns = useStore((s) => s.data.columns);
  const projects = useStore((s) => s.data.projects);
  const selected = useStore((s) => s.selection.includes(task.id));
  const done = isDone(task, columns);
  return (
    <div
      className={`cursor-pointer truncate rounded border-l-2 bg-board-card px-1.5 py-0.5 text-xs shadow-board-card ${
        done ? "text-muted-foreground/70 line-through" : ""
      } ${selected ? "ring-2 ring-ring" : ""}`}
      style={{ borderLeftColor: projects.find((p) => p.id === task.project_id)?.color }}
      title={task.title}
    >
      {task.priority !== "none" && <span className={priorityInfo(task.priority).className}>● </span>}
      {task.title}
    </div>
  );
}
