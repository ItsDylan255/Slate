import { useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { useStore } from "../../store";
import type { Activity as ActivityRow, Data } from "../../lib/types";
import { formatDateTime, formatShort } from "../../lib/dates";
import { priorityInfo } from "../../lib/priority";
import { useT, type TFunc, type TKey } from "../../i18n";
import type { Lang } from "../../i18n";

const FIELD_LABELS: Record<string, TKey> = {
  title: "task.title",
  priority: "task.priority",
  start_date: "task.startDate",
  due_date: "task.dueDate",
  reminder_at: "task.reminder",
  recurrence: "task.recurrence",
  project_id: "task.project",
};

function describe(a: ActivityRow, t: TFunc, lang: Lang, d: Data): string {
  const detail = a.detail ? (JSON.parse(a.detail) as Record<string, unknown>) : {};
  switch (a.action) {
    case "created":
      return t("activity.created");
    case "moved":
      return t("activity.moved", { to: String(detail.to) });
    case "description":
      return t("activity.description");
    case "attached":
      return t("activity.attached", { name: String(detail.name) });
    case "changed": {
      const field = String(detail.field);
      const to = detail.to as string | number | null;
      if (field === "archived") return to ? t("activity.archived") : t("activity.restored");
      const label = FIELD_LABELS[field] ? t(FIELD_LABELS[field]) : field;
      if (to === null || to === "") return t("activity.cleared", { field: label });
      let value = String(to);
      if (field === "priority") value = t(priorityInfo(to as never).label);
      if (field === "start_date" || field === "due_date") value = formatShort(String(to), lang);
      if (field === "reminder_at") value = String(to).replace("T", " ");
      if (field === "project_id") value = d.projects.find((p) => p.id === to)?.name ?? "?";
      if (field === "recurrence") return t("activity.recurrence");
      return t("activity.changed", { field: label, value });
    }
    default:
      return a.action;
  }
}

/** Automatischer Änderungsverlauf einer Aufgabe (aufklappbar). */
export function Activity({ taskId }: { taskId: string }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const d = useStore((s) => s.data);
  const [open, setOpen] = useState(false);
  const items = d.activity.filter((a) => a.task_id === taskId).sort((x, y) => y.created_at - x.created_at);

  return (
    <section>
      <button className="section-title flex cursor-pointer items-center gap-1.5" onClick={() => setOpen(!open)}>
        <History className="size-4 text-muted-foreground" />
        {t("task.history")}
        <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
        <ChevronRight className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2 border-l border-border pl-4">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex-1">{describe(a, t, lang, d)}</span>
              <span className="text-muted-foreground/70">{formatDateTime(a.created_at, lang)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
