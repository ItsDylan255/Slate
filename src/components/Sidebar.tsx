import { useState } from "react";
import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ChevronRight, CircleCheck, House, Layout, MoreHorizontal, PanelLeft, Plus, Search, Settings, ArrowDownCircle } from "lucide-react";
import { isDone, useStore } from "../store";
import type { Project } from "../lib/types";
import { useT } from "../i18n";
import { SlateLogo } from "./SlateLogo";
import { ask } from "@tauri-apps/plugin-dialog";
import { installUpdate, useUpdate } from "../lib/updater";

/** Knopf zum Ein-/Ausklappen der Seitenleiste (Strg+B), wie Kaneos Sidebar-Trigger. */
export function SidebarTrigger() {
  const t = useT();
  const toggle = useStore((s) => s.toggleSidebar);
  return (
    <button className="btn-icon -ml-1" onClick={toggle} title={`${t("nav.toggleSidebar")} (${t("kbd.ctrl")}+B)`}>
      <PanelLeft className="size-4" />
    </button>
  );
}

/** Seitenleiste im Stil von Kaneo: App-Kopf, Navigation, aufklappbare Projektliste, Einstellungen. */
export function Sidebar() {
  const t = useT();
  const view = useStore((s) => s.view);
  const allProjects = useStore((s) => s.data.projects);
  const projects = allProjects.filter((p) => !p.archived);
  const openCount = useStore((s) => s.data.tasks.filter((x) => !x.archived && !isDone(x, s.data.columns)).length);
  const { go, set, reorderProjects } = useStore.getState();
  const [projectsOpen, setProjectsOpen] = useState(true);
  const update = useUpdate();
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || active.id === over.id) return;
    const ids = projects.map((p) => p.id);
    reorderProjects(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  const NavItem = ({ active, icon, label, onClick, count }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void; count?: number }) => (
    <button
      onClick={onClick}
      className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0 ${
        active ? "bg-sidebar-accent font-medium text-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
      {count ? <span className="ml-auto text-[11px] font-medium text-muted-foreground tabular-nums">{count > 99 ? "99+" : count}</span> : null}
    </button>
  );

  const draggedProject = projects.find((p) => p.id === dragging);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-sidebar">
      {/* App-Kopf mit Such-Symbol (bei Kaneo: Workspace-Umschalter) */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 px-2">
          <SlateLogo className="size-7" />
          <span className="truncate text-sm font-semibold text-foreground">{t("app.name")}</span>
        </div>
        <button
          onClick={() => set({ paletteOpen: true })}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
          title={`${t("nav.search")} (${t("kbd.ctrlK")})`}
        >
          <Search className="size-4" />
        </button>
      </div>

      <nav className="space-y-0.5 p-2 pt-1">
        <NavItem active={view.kind === "home"} icon={<House />} label={t("nav.home")} onClick={() => go({ kind: "home" })} />
        <NavItem active={view.kind === "my"} icon={<CircleCheck />} label={t("nav.myTasks")} onClick={() => go({ kind: "my" })} count={openCount} />
        <NavItem active={view.kind === "archive"} icon={<Archive />} label={t("nav.archive")} onClick={() => go({ kind: "archive" })} />
      </nav>

      <div className="relative flex min-h-0 flex-1 flex-col p-2 pt-1">
        <button
          onClick={() => setProjectsOpen(!projectsOpen)}
          className="flex h-7 cursor-pointer items-center gap-1 self-start rounded-md px-2 text-xs font-medium text-foreground"
        >
          <span>{t("nav.projects")}</span>
          <ChevronRight className={`size-3.5 text-sidebar-foreground/60 transition-transform duration-200 ${projectsOpen ? "rotate-90" : ""}`} />
        </button>
        <button
          className="absolute top-1.5 right-2 flex size-6 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-foreground"
          onClick={() => set({ projectDialog: {} })}
          title={`${t("project.new")} (P)`}
        >
          <Plus className="size-4" />
        </button>

        {projectsOpen && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {projects.length === 0 && (
              <button
                onClick={() => set({ projectDialog: {} })}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <Plus className="size-4" /> {t("project.createFirst")}
              </button>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragStart={(e) => setDragging(String(e.active.id))}
              onDragEnd={onDragEnd}
              onDragCancel={() => setDragging(null)}
            >
              <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-0.5">
                  {projects.map((p) => (
                    <ProjectItem key={p.id} project={p} active={view.kind === "project" && view.projectId === p.id} />
                  ))}
                </div>
              </SortableContext>
              {/* Sichtbare Kopie der gezogenen Zeile */}
              <DragOverlay dropAnimation={null}>
                {draggedProject && (
                  <div className="flex h-8 w-60 items-center gap-2 rounded-lg border border-border bg-sidebar px-2 text-sm text-foreground shadow-lg/10">
                    <Layout className="size-4 shrink-0 text-sidebar-foreground" />
                    <span className="truncate">{draggedProject.name}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </div>
        )}
      </div>

      <div className="p-2">
        {(update.state === "available" || update.state === "downloading") && (
          <NavItem
            active={false}
            icon={<ArrowDownCircle className="text-info" />}
            label={
              update.state === "downloading"
                ? t("update.downloading", { p: Math.round((update.progress ?? 0) * 100) })
                : t("update.sidebar", { v: update.version ?? "" })
            }
            onClick={async () => {
              if (update.state === "available" && (await ask(t("update.confirm", { v: update.version ?? "" })))) installUpdate();
            }}
          />
        )}
        <NavItem active={false} icon={<Settings />} label={t("nav.settings")} onClick={() => set({ settingsOpen: true })} />
      </div>
    </aside>
  );
}

function ProjectItem({ project: p, active }: { project: Project; active: boolean }) {
  const t = useT();
  const { go, set } = useStore.getState();
  const view = useStore((s) => s.view);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => go({ kind: "project", projectId: p.id, tab: view.kind === "project" ? view.tab : "board" })}
      className={`group relative flex h-8 cursor-pointer items-center gap-2 rounded-lg pr-8 pl-2 text-sm transition-colors ${
        active ? "bg-sidebar-accent font-medium text-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <Layout className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
      <button
        className="absolute top-1.5 right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
        title={t("project.settings")}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          set({ projectDialog: { projectId: p.id } });
        }}
      >
        <MoreHorizontal className="size-4" />
      </button>
    </div>
  );
}
