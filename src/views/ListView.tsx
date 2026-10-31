import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { isDone, taskKey, useStore } from "../store";
import type { Task } from "../lib/types";
import { priorityInfo } from "../lib/priority";
import { useTaskClick } from "../components/task/useTaskClick";
import { DueBadge, PriorityIcon, TaskIndicators, TaskLabels } from "../components/task/bits";
import { useT, type TKey } from "../i18n";
import { formatShort } from "../lib/dates";

type SortKey = "number" | "title" | "status" | "priority" | "start" | "due";

/** Tabellenansicht aller Aufgaben eines Projekts, sortierbar per Klick auf die Spaltenköpfe. */
export function ListView({ tasks }: { tasks: Task[] }) {
  const t = useT();
  const d = useStore((s) => s.data);
  const lang = useStore((s) => s.lang);
  const selection = useStore((s) => s.selection);
  const set = useStore((s) => s.set);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "number", asc: true });

  const colIndex = (id: string | null) => (id ? d.columns.findIndex((c) => c.id === id) : -1);

  const sorted = useMemo(() => {
    const list = tasks.filter((x) => !x.archived);
    const val = (x: Task): string | number => {
      switch (sort.key) {
        case "number":
          return x.number;
        case "title":
          return x.title.toLowerCase();
        case "status":
          return colIndex(x.column_id);
        case "priority":
          return priorityInfo(x.priority).rank;
        case "start":
          return x.start_date ?? "9999";
        case "due":
          return x.due_date ?? "9999";
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.asc ? r : -r;
    });
  }, [tasks, sort, d.columns]); // eslint-disable-line react-hooks/exhaustive-deps

  const click = useTaskClick(sorted.map((x) => x.id));
  const allSelected = sorted.length > 0 && sorted.every((x) => selection.includes(x.id));

  const Head = ({ k, label, className = "" }: { k: SortKey; label: TKey; className?: string }) => (
    <th
      className={`cursor-pointer px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground hover:text-foreground ${className}`}
      onClick={() => setSort((s) => ({ key: k, asc: s.key === k ? !s.asc : true }))}
    >
      <span className="inline-flex items-center gap-1">
        {t(label)}
        {sort.key === k && (sort.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );

  return (
    <div className="h-full overflow-auto p-6">
      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-lg border border-border text-sm ">
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th className="w-8 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => set({ selection: allSelected ? [] : sorted.map((x) => x.id) })}
              />
            </th>
            <Head k="number" label="list.number" className="w-20" />
            <Head k="title" label="list.title" />
            <Head k="status" label="task.status" className="w-36" />
            <Head k="priority" label="task.priority" className="w-28" />
            <Head k="start" label="task.startDate" className="w-28" />
            <Head k="due" label="task.dueDate" className="w-28" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((x) => {
            const done = isDone(x, d.columns);
            const selected = selection.includes(x.id);
            return (
              <tr
                key={x.id}
                onClick={(e) => click.onClick(e, x.id)}
                onContextMenu={(e) => click.onContextMenu(e, x.id)}
                className={`cursor-pointer ${selected ? "bg-board-card-selected" : "hover:bg-accent"}`}
              >
                <td className="border-t border-border px-3 py-2 " onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() =>
                      set({ selection: selected ? selection.filter((s) => s !== x.id) : [...selection, x.id] })
                    }
                  />
                </td>
                <td className="border-t border-border px-3 py-2 font-mono text-xs text-muted-foreground/70 ">
                  {taskKey(x, d.projects)}
                </td>
                <td className="border-t border-border px-3 py-2 ">
                  <div className="flex items-center gap-2">
                    <span className={`truncate ${done ? "text-muted-foreground/70 line-through" : ""}`}>{x.title}</span>
                    <TaskLabels taskId={x.id} nowrap />
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <TaskIndicators task={x} />
                    </span>
                  </div>
                </td>
                <td className="border-t border-border px-3 py-2 text-xs text-muted-foreground dark:text-muted-foreground/70">
                  {d.columns.find((c) => c.id === x.column_id)?.name ?? t("view.backlog")}
                </td>
                <td className="border-t border-border px-3 py-2 text-xs ">
                  <PriorityIcon priority={x.priority} withLabel />
                </td>
                <td className="border-t border-border px-3 py-2 text-xs text-muted-foreground ">
                  {x.start_date && formatShort(x.start_date, lang)}
                </td>
                <td className="border-t border-border px-3 py-2 ">
                  {x.due_date && <DueBadge date={x.due_date} done={done} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t("common.noTasks")}</p>}
    </div>
  );
}
