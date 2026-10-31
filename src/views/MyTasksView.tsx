import { useState } from "react";
import { SidebarTrigger } from "../components/Sidebar";
import { CalendarDays, List } from "lucide-react";
import { useStore } from "../store";
import type { Task } from "../lib/types";
import { applyFilters } from "../lib/filter";
import { daysUntil } from "../lib/dates";
import { priorityInfo } from "../lib/priority";
import { TaskRow } from "../components/task/TaskRow";
import { useTaskClick } from "../components/task/useTaskClick";
import { FilterBar } from "../components/FilterBar";
import { CalendarView } from "./CalendarView";
import { useT, type TKey } from "../i18n";

/** Alle Aufgaben aus allen (nicht archivierten) Projekten, nach Fälligkeit gruppiert. */
export function MyTasksView() {
  const t = useT();
  const d = useStore((s) => s.data);
  const filters = useStore((s) => s.filters);
  const [mode, setMode] = useState<"list" | "calendar">("list");

  const projectIds = new Set(d.projects.filter((p) => !p.archived).map((p) => p.id));
  const tasks = applyFilters(
    d.tasks.filter((x) => !x.archived && x.title && projectIds.has(x.project_id)),
    filters,
    d,
  );

  const groups: { key: TKey; tone?: string; test: (x: Task) => boolean }[] = [
    { key: "home.overdue", tone: "text-due-overdue", test: (x) => !!x.due_date && daysUntil(x.due_date) < 0 },
    { key: "home.today", tone: "text-warning", test: (x) => !!x.due_date && daysUntil(x.due_date) === 0 },
    { key: "my.thisWeek", test: (x) => !!x.due_date && daysUntil(x.due_date) > 0 && daysUntil(x.due_date) <= 7 },
    { key: "my.later", test: (x) => !!x.due_date && daysUntil(x.due_date) > 7 },
    { key: "my.noDate", test: (x) => !x.due_date },
  ];
  const grouped = groups.map((g) => ({
    ...g,
    list: tasks
      .filter(g.test)
      .sort(
        (a, b) =>
          (a.due_date ?? "").localeCompare(b.due_date ?? "") ||
          priorityInfo(b.priority).rank - priorityInfo(a.priority).rank,
      ),
  }));
  const click = useTaskClick(grouped.flatMap((g) => g.list.map((x) => x.id)));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">{t("nav.myTasks")}</h1>
        <span className="text-sm text-muted-foreground">{tasks.length}</span>
        <div className="flex-1" />
        <div className="flex rounded-md border border-border">
          <button
            className={`flex items-center gap-1 px-2 py-1 text-xs ${mode === "list" ? "bg-accent" : "text-muted-foreground"}`}
            onClick={() => setMode("list")}
          >
            <List size={13} /> {t("view.list")}
          </button>
          <button
            className={`flex items-center gap-1 px-2 py-1 text-xs ${mode === "calendar" ? "bg-accent" : "text-muted-foreground"}`}
            onClick={() => setMode("calendar")}
          >
            <CalendarDays size={13} /> {t("view.calendar")}
          </button>
        </div>
      </header>
      <FilterBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "calendar" ? (
          <CalendarView tasks={tasks} />
        ) : (
          <div className="mx-auto max-w-5xl space-y-6 p-6">
            {grouped.map((g) =>
              g.list.length === 0 ? null : (
                <section key={g.key}>
                  <h3 className={`mb-2 text-xs font-semibold tracking-wide uppercase ${g.tone ?? "text-muted-foreground"}`}>
                    {t(g.key)} · {g.list.length}
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-border">
                    {g.list.map((x) => (
                      <TaskRow
                        key={x.id}
                        task={x}
                        showProject
                        onClick={(e) => click.onClick(e, x.id)}
                        onContextMenu={(e) => click.onContextMenu(e, x.id)}
                      />
                    ))}
                  </div>
                </section>
              ),
            )}
            {tasks.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t("common.noTasks")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
