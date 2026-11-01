import { CalendarDays, CircleDashed, GanttChart, Kanban, List } from "lucide-react";
import { useStore, type ProjectView as Tab } from "../store";
import { applyFilters } from "../lib/filter";
import { FilterBar } from "../components/FilterBar";
import { SidebarTrigger } from "../components/Sidebar";
import { BoardView } from "./BoardView";
import { ListView } from "./ListView";
import { BacklogView } from "./BacklogView";
import { CalendarView } from "./CalendarView";
import { GanttView } from "./GanttView";
import { useT, type TKey } from "../i18n";

export const PROJECT_TABS: { tab: Tab; label: TKey; icon: typeof Kanban }[] = [
  { tab: "board", label: "view.board", icon: Kanban },
  { tab: "list", label: "view.list", icon: List },
  { tab: "backlog", label: "view.backlog", icon: CircleDashed },
  { tab: "calendar", label: "view.calendar", icon: CalendarDays },
  { tab: "gantt", label: "view.gantt", icon: GanttChart },
];

/** Projektseite wie bei Kaneo: Kopfzeile mit Breadcrumb + Ansichts-Umschalter, Werkzeugleiste, Inhalt. */
export function ProjectView({ projectId, tab }: { projectId: string; tab: Tab }) {
  const t = useT();
  const d = useStore((s) => s.data);
  const filters = useStore((s) => s.filters);
  const { go, set } = useStore.getState();
  const project = d.projects.find((p) => p.id === projectId);
  if (!project) return null;

  const tasks = applyFilters(
    d.tasks.filter((x) => x.project_id === projectId && x.title),
    filters,
    d,
  );
  const backlogCount = d.tasks.filter((x) => x.project_id === projectId && !x.column_id && !x.archived).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <SidebarTrigger />
        <nav className="flex max-w-[40%] min-w-0 shrink-0 items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">{t("nav.projects")}</span>
          <span className="text-muted-foreground/50">/</span>
          <button
            className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-foreground hover:bg-accent"
            onClick={() => set({ projectDialog: { projectId } })}
            title={t("project.settings")}
          >
            <span className="truncate">{project.name}</span>
          </button>
</nav>

        <nav className="segmented">
          {PROJECT_TABS.map(({ tab: id, label, icon: Icon }, i) => (
            <button
              key={id}
              onClick={() => go({ kind: "project", projectId, tab: id })}
              title={`${t(label)} (${i + 1})`}
              className={tab === id ? "segmented-item-active" : "segmented-item"}
            >
              <Icon />
              <span className="hidden lg:inline">{t(label)}</span>
              {id === "backlog" && backlogCount > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">{backlogCount}</span>}
            </button>
          ))}
        </nav>

      </header>
      <FilterBar />
      <div className="min-h-0 flex-1">
        {tab === "board" && <BoardView projectId={projectId} tasks={tasks} />}
        {tab === "list" && <ListView tasks={tasks} />}
        {tab === "backlog" && <BacklogView projectId={projectId} tasks={tasks} />}
        {tab === "calendar" && <CalendarView projectId={projectId} tasks={tasks} />}
        {tab === "gantt" && <GanttView tasks={tasks} />}
      </div>
    </div>
  );
}
