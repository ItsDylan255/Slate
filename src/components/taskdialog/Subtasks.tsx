import { useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../../store";
import type { Subtask } from "../../lib/types";
import { daysUntil } from "../../lib/dates";
import { DatePicker } from "../ui/DatePicker";
import { useT } from "../../i18n";

export function Subtasks({ taskId }: { taskId: string }) {
  const t = useT();
  const subtasks = useStore((s) => s.data.subtasks)
    .filter((x) => x.task_id === taskId)
    .sort((a, b) => a.position - b.position);
  const { addSubtask, reorderSubtasks } = useStore.getState();
  const [title, setTitle] = useState("");
  const done = subtasks.filter((s) => s.done).length;
  // Erst nach 4 px Bewegung ziehen, damit Klicks ins Textfeld normal funktionieren
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const add = async () => {
    if (!title.trim()) return;
    await addSubtask(taskId, title.trim());
    setTitle("");
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = subtasks.map((s) => s.id);
    reorderSubtasks(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="section-title">{t("task.subtasks")}</h3>
        {subtasks.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground/70">
              {done}/{subtasks.length}
            </span>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-accent">
              <div className="h-full bg-priority-bar" style={{ width: `${(done / subtasks.length) * 100}%` }} />
            </div>
          </>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onDragEnd}>
        <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {subtasks.map((s) => (
              <SubtaskRow key={s.id} subtask={s} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="mt-0.5 flex items-center gap-2 pl-6">
        <Plus size={14} className="text-muted-foreground/70" />
        <input
          className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/70"
          placeholder={t("task.addSubtask")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") add();
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
    </section>
  );
}

function SubtaskRow({ subtask: s }: { subtask: Subtask }) {
  const t = useT();
  const { patch, remove } = useStore.getState();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const overdue = !!s.due_date && !s.done && daysUntil(s.due_date) < 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative flex items-center gap-2 rounded-md py-0.5 pr-1 hover:bg-accent ${isDragging ? "z-10 bg-accent shadow-sm" : ""}`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        title={t("subtask.drag")}
      >
        <GripVertical size={13} />
      </button>
      <input
        type="checkbox"
        className="cursor-pointer"
        checked={!!s.done}
        onChange={() => patch("subtasks", s.id, { done: s.done ? 0 : 1 })}
      />
      <input
        className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${s.done ? "text-muted-foreground/70 line-through" : ""}`}
        defaultValue={s.title}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
        }}
        onBlur={(e) => e.target.value.trim() && e.target.value !== s.title && patch("subtasks", s.id, { title: e.target.value.trim() })}
      />
      <div className={s.due_date ? "" : "opacity-0 group-hover:opacity-100"}>
        <DatePicker
          variant="compact"
          value={s.due_date}
          onChange={(v) => patch("subtasks", s.id, { due_date: v })}
          placeholder={t("subtask.date")}
          className={overdue ? "font-medium text-due-overdue" : ""}
        />
      </div>
      <button className="btn-icon h-5 w-5 opacity-0 group-hover:opacity-100" title={t("common.delete")} onClick={() => remove("subtasks", s.id)}>
        <X size={12} />
      </button>
    </div>
  );
}
