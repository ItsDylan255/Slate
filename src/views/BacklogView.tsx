import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { useStore } from "../store";
import type { Task } from "../lib/types";
import { TaskRow } from "../components/task/TaskRow";
import { useTaskClick } from "../components/task/useTaskClick";
import { useT } from "../i18n";

/** Backlog: Aufgaben, die noch nicht auf dem Board eingeplant sind (column_id = null). */
export function BacklogView({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  const t = useT();
  const columns = useStore((s) => s.data.columns).filter((c) => c.project_id === projectId);
  const backlog = tasks.filter((x) => x.column_id === null && !x.archived);
  const click = useTaskClick(backlog.map((x) => x.id));
  const [title, setTitle] = useState("");
  const firstColumn = columns.find((c) => !c.is_done) ?? columns[0];

  const add = async () => {
    if (!title.trim()) return;
    await useStore.getState().createTask(projectId, null, title.trim());
    setTitle("");
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-4xl">
        <p className="mb-4 text-sm text-muted-foreground">{t("backlog.hint")}</p>
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className="input"
            placeholder={t("backlog.placeholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button className="btn-primary shrink-0" disabled={!title.trim()}>
            <Plus size={14} /> {t("common.add")}
          </button>
        </form>
        <div className="overflow-hidden rounded-lg border border-border">
          {backlog.map((x) => (
            <TaskRow
              key={x.id}
              task={x}
              onClick={(e) => click.onClick(e, x.id)}
              onContextMenu={(e) => click.onContextMenu(e, x.id)}
              right={
                firstColumn && (
                  <button
                    className="btn-ghost shrink-0 px-2 py-0.5 text-xs opacity-0 group-hover:opacity-100"
                    title={t("backlog.toBoard", { col: firstColumn.name })}
                    onClick={(e) => {
                      e.stopPropagation();
                      useStore.getState().updateTask(x.id, { column_id: firstColumn.id });
                    }}
                  >
                    {firstColumn.name} <ArrowRight size={12} />
                  </button>
                )
              }
            />
          ))}
          {backlog.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t("backlog.empty")}</p>}
        </div>
      </div>
    </div>
  );
}
