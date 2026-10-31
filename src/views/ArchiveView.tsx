import { ArchiveRestore, Layout, Trash2 } from "lucide-react";
import { SidebarTrigger } from "../components/Sidebar";
import { useStore } from "../store";
import { TaskRow } from "../components/task/TaskRow";
import { useTaskClick } from "../components/task/useTaskClick";
import { ConfirmButton } from "../components/ui/ConfirmButton";
import { useT } from "../i18n";

/** Archiv: ausgeblendete Aufgaben und Projekte wiederherstellen oder endgültig löschen. */
export function ArchiveView() {
  const t = useT();
  const d = useStore((s) => s.data);
  const { updateTask, deleteTasks, patch, deleteProject } = useStore.getState();

  const projects = d.projects.filter((p) => p.archived);
  const tasks = d.tasks.filter((x) => x.archived).sort((a, b) => b.updated_at - a.updated_at);
  const click = useTaskClick(tasks.map((x) => x.id));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">{t("nav.archive")}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-8 p-6">
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("archive.projects")} · {projects.length}
            </h3>
            <div className="overflow-hidden rounded-lg border border-border">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-0 ">
                  <Layout className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => patch("projects", p.id, { archived: 0 })}>
                    <ArchiveRestore size={13} /> {t("archive.restore")}
                  </button>
                  <ConfirmButton className="btn-danger px-2 py-1 text-xs" onConfirm={() => deleteProject(p.id)}>
                    <Trash2 size={13} />
                  </ConfirmButton>
                </div>
              ))}
              {projects.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("archive.empty")}</p>}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("archive.tasks")} · {tasks.length}
            </h3>
            <div className="overflow-hidden rounded-lg border border-border">
              {tasks.map((x) => (
                <TaskRow
                  key={x.id}
                  task={x}
                  showProject
                  onClick={(e) => click.onClick(e, x.id)}
                  onContextMenu={(e) => click.onContextMenu(e, x.id)}
                  right={
                    <span className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                      <button className="btn-icon" title={t("archive.restore")} onClick={() => updateTask(x.id, { archived: 0 })}>
                        <ArchiveRestore size={14} />
                      </button>
                      <ConfirmButton className="btn-icon hover:text-destructive" confirmText="?" onConfirm={() => deleteTasks([x.id])}>
                        <Trash2 size={14} />
                      </ConfirmButton>
                    </span>
                  }
                />
              ))}
              {tasks.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("archive.empty")}</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
