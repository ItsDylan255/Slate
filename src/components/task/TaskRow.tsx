import { isDone, taskKey, useStore } from "../../store";
import type { Task } from "../../lib/types";
import { DueBadge, PriorityIcon, TaskIndicators, TaskLabels } from "./bits";

/** Kompakte Zeile für Listen (Übersicht, Meine Aufgaben, Backlog, Archiv). */
export function TaskRow({
  task,
  onClick,
  onContextMenu,
  showProject,
  right,
}: {
  task: Task;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  showProject?: boolean;
  right?: React.ReactNode;
}) {
  const d = useStore((s) => s.data);
  const selected = useStore((s) => s.selection.includes(task.id));
  const project = d.projects.find((p) => p.id === task.project_id);
  const column = d.columns.find((c) => c.id === task.column_id);
  const done = isDone(task, d.columns);

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group flex h-10 cursor-pointer items-center gap-3 border-b border-border px-3 text-[13px] last:border-b-0 ${
        selected ? "bg-board-card-selected" : "hover:bg-accent"
      }`}
    >
      <PriorityIcon priority={task.priority} />
      <span className="w-14 shrink-0 font-mono text-[11px] text-board-id">{taskKey(task, d.projects)}</span>
      <span className={`min-w-32 flex-1 truncate ${done ? "text-board-title-done line-through" : "font-medium text-board-title"}`}>{task.title}</span>
      <span className="flex min-w-0 shrink items-center gap-1 overflow-hidden">
        <TaskIndicators task={task} />
        <TaskLabels taskId={task.id} nowrap max={2} />
      </span>
      {showProject && project && (
        <span className="flex max-w-40 shrink-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: project.color }} />
          {project.name}
        </span>
      )}
      <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{column?.name ?? "Backlog"}</span>
      <span className="w-20 shrink-0 text-right">{task.due_date && <DueBadge date={task.due_date} done={done} />}</span>
      {right}
    </div>
  );
}
