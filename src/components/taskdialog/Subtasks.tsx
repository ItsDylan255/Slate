import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useStore } from "../../store";
import { useT } from "../../i18n";

export function Subtasks({ taskId }: { taskId: string }) {
  const t = useT();
  const subtasks = useStore((s) => s.data.subtasks)
    .filter((x) => x.task_id === taskId)
    .sort((a, b) => a.position - b.position);
  const { addSubtask, patch, remove } = useStore.getState();
  const [title, setTitle] = useState("");
  const done = subtasks.filter((s) => s.done).length;

  const add = async () => {
    if (!title.trim()) return;
    await addSubtask(taskId, title.trim());
    setTitle("");
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
      <div className="space-y-0.5">
        {subtasks.map((s) => (
          <div key={s.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent">
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={!!s.done}
              onChange={() => patch("subtasks", s.id, { done: s.done ? 0 : 1 })}
            />
            <input
              className={`flex-1 bg-transparent text-sm outline-none ${s.done ? "text-muted-foreground/70 line-through" : ""}`}
              defaultValue={s.title}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
              }}
              onBlur={(e) => e.target.value.trim() && e.target.value !== s.title && patch("subtasks", s.id, { title: e.target.value.trim() })}
            />
            <button className="btn-icon h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => remove("subtasks", s.id)}>
              <X size={12} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 px-1">
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
      </div>
    </section>
  );
}
