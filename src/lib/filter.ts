import type { Filters } from "../store";
import { isDone } from "../store";
import type { Data, Task } from "./types";
import { daysUntil } from "./dates";

/** Prüft, ob eine Aufgabe zum Suchtext passt (Titel, Beschreibung, Nummer). */
export function matchesText(task: Task, text: string, key: string) {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  return (
    task.title.toLowerCase().includes(q) ||
    task.description.toLowerCase().includes(q) ||
    key.toLowerCase() === q
  );
}

export function applyFilters(tasks: Task[], f: Filters, data: Data): Task[] {
  return tasks.filter((t) => {
    if (f.text) {
      const p = data.projects.find((x) => x.id === t.project_id);
      if (!matchesText(t, f.text, `${p?.key}-${t.number}`)) return false;
    }
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (f.labels.length) {
      const own = data.task_labels
        .filter((tl) => tl.task_id === t.id)
        .map((tl) => data.labels.find((l) => l.id === tl.label_id)?.name.toLowerCase());
      if (!f.labels.some((l) => own.includes(l))) return false;
    }
    if (f.due !== "all") {
      if (f.due === "none") {
        if (t.due_date) return false;
      } else {
        if (!t.due_date) return false;
        const d = daysUntil(t.due_date);
        if (f.due === "overdue" && !(d < 0)) return false;
        if (f.due === "today" && d !== 0) return false;
        if (f.due === "week" && !(d >= 0 && d <= 7)) return false;
      }
    }
    if (f.hideDone && isDone(t, data.columns)) return false;
    return true;
  });
}

export const filtersActive = (f: Filters) =>
  !!f.text || f.priorities.length > 0 || f.labels.length > 0 || f.due !== "all" || f.hideDone;
