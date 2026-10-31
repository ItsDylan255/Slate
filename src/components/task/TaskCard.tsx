import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check } from "lucide-react";
import { taskKey, useStore } from "../../store";
import type { Task } from "../../lib/types";
import { CardFields, DueBadge, PriorityMarks, TaskIndicators, TaskLabels } from "./bits";
import { priorityInfo } from "../../lib/priority";
import { useT } from "../../i18n";

/** Karte auf dem Board, die sich per Drag & Drop verschieben lässt. */
export function TaskCard({
  task,
  done,
  onClick,
  onContextMenu,
}: {
  task: Task;
  done: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task" },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={isDragging ? "opacity-30" : ""}
    >
      <TaskCardView task={task} done={done} />
    </div>
  );
}

/** Darstellung einer Karte wie bei Kaneo: Nummer, Titel, darunter kleine Chips. */
export function TaskCardView({ task, done, floating }: { task: Task; done?: boolean; floating?: boolean }) {
  const t = useT();
  const projects = useStore((s) => s.data.projects);
  const selected = useStore((s) => s.selection.includes(task.id));

  return (
    <div
      className={`group relative flex cursor-pointer flex-col rounded-[10px] border p-3 transition-[background-color,border-color,box-shadow] duration-150 ease-out ${
        done ? "border-board-card-done-border bg-board-card-done" : "border-board-card-border bg-board-card"
      } ${floating ? "border-board-card-border-hover bg-board-card" : "hover:border-board-card-border-hover"} ${
        selected ? "border-board-card-selected-border! bg-board-card-selected!" : ""
      }`}
    >
      <div className="flex h-4.5 items-center gap-1.5">
        {selected && (
          <span className="flex size-3.5 items-center justify-center rounded-[4px] bg-primary text-primary-foreground">
            <Check className="size-2.5" strokeWidth={3} />
          </span>
        )}
        <span className={`truncate font-mono text-[11px] leading-3.5 ${done ? "text-board-id-done" : "text-board-id"}`}>
          {taskKey(task, projects)}
        </span>
      </div>
      <div
        className={`mt-1 line-clamp-3 text-[13px] leading-[18px] break-words ${
          done ? "text-board-title-done" : "font-medium text-board-title"
        }`}
      >
        {task.title}
      </div>
      {!done && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1 empty:hidden">
          {task.priority !== "none" && (
            <span className="chip w-5.5 justify-center px-0" title={`${t("task.priority")}: ${t(priorityInfo(task.priority).label)}`}>
              <PriorityMarks priority={task.priority} />
            </span>
          )}
          {task.due_date && <DueBadge date={task.due_date} />}
          <TaskIndicators task={task} />
          <TaskLabels taskId={task.id} max={2} />
          <CardFields task={task} />
        </div>
      )}
    </div>
  );
}
