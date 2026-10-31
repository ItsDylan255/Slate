// Kleine Anzeige-Bausteine rund um Aufgaben (im Stil der Kaneo-"Chips").
import { Calendar, Lock, Paperclip, Repeat } from "lucide-react";
import { useStore } from "../../store";
import type { Priority, Task } from "../../lib/types";
import { formatDue, priorityInfo } from "../../lib/priority";
import { useT } from "../../i18n";

const MARKS = [3, 7, 11];
const LEVELS: Record<Priority, { filled: number; tone: string }> = {
  none: { filled: 0, tone: "" },
  low: { filled: 1, tone: "fill-priority-low stroke-priority-low" },
  medium: { filled: 2, tone: "fill-priority-medium stroke-priority-medium" },
  high: { filled: 3, tone: "fill-priority-high stroke-priority-high" },
  urgent: { filled: 3, tone: "fill-priority-urgent stroke-priority-urgent" },
};

/** Drei Striche wie bei Kaneo – je mehr gefüllt, desto wichtiger. */
export function PriorityMarks({ priority, className = "size-3.5" }: { priority: Priority; className?: string }) {
  const { filled, tone } = LEVELS[priority];
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className={`shrink-0 ${className}`}>
      {MARKS.map((x, i) => (
        <g key={x} className={i < filled ? tone : "fill-priority-bar-empty stroke-priority-bar-empty"}>
          <path d={`M${x} 2.5v5.5`} fill="none" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx={x} cy="11" r="1" stroke="none" />
        </g>
      ))}
    </svg>
  );
}

export function PriorityIcon({ priority, withLabel }: { priority: Priority; withLabel?: boolean }) {
  const t = useT();
  const p = priorityInfo(priority);
  return (
    <span className="inline-flex items-center gap-1.5 text-chip-foreground" title={`${t("task.priority")}: ${t(p.label)}`}>
      <PriorityMarks priority={priority} />
      {withLabel && t(p.label)}
    </span>
  );
}

/** Kreis, der sich mit dem Fortschritt der Unteraufgaben füllt. */
export function ProgressGlyph({ done, total, className = "size-3" }: { done: number; total: number; className?: string }) {
  const r = 4.75;
  const c = 2 * Math.PI * r;
  if (total > 0 && done >= total)
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true" className={className}>
        <circle cx="6" cy="6" r="5.5" className="fill-priority-bar" />
        <path d="m3.6 6.2 1.6 1.6 3.2-3.4" fill="none" className="stroke-board-card" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={`-rotate-90 ${className}`}>
      <circle cx="6" cy="6" r={r} fill="none" className="stroke-priority-bar-empty" strokeWidth="1.5" />
      {done > 0 && (
        <circle cx="6" cy="6" r={r} fill="none" className="stroke-priority-bar" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - done / total)} />
      )}
    </svg>
  );
}

export function DueBadge({ date, done }: { date: string; done?: boolean }) {
  const lang = useStore((s) => s.lang);
  const due = formatDue(date, lang);
  const overdue = due.overdue && !done;
  return (
    <span className={`chip ${overdue ? "font-medium text-due-overdue" : ""}`}>
      <Calendar className={overdue ? "" : "text-chip-icon"} />
      {due.label}
    </span>
  );
}

export function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="chip max-w-36 gap-1.5">
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function TaskLabels({ taskId, nowrap, max = 3 }: { taskId: string; nowrap?: boolean; max?: number }) {
  const labels = useStore((s) => s.data.labels);
  const links = useStore((s) => s.data.task_labels);
  const own = links
    .filter((l) => l.task_id === taskId)
    .map((l) => labels.find((x) => x.id === l.label_id))
    .filter((l): l is NonNullable<typeof l> => !!l)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (own.length === 0) return null;
  const hidden = own.length - max;
  return (
    <span className={`inline-flex gap-1 ${nowrap ? "shrink-0 flex-nowrap" : "flex-wrap"}`} title={own.map((l) => l.name).join(", ")}>
      {own.slice(0, max).map((l) => (
        <LabelChip key={l.id} name={l.name} color={l.color} />
      ))}
      {hidden > 0 && <span className="chip font-medium text-chip-muted">+{hidden}</span>}
    </span>
  );
}

/** Chips für Unteraufgaben, Kommentare, Anhänge, "blockiert" und Wiederholung. */
export function TaskIndicators({ task }: { task: Task }) {
  const t = useT();
  const d = useStore((s) => s.data);
  const subs = d.subtasks.filter((s) => s.task_id === task.id);
  const doneSubs = subs.filter((s) => s.done).length;
  const files = d.attachments.filter((a) => a.task_id === task.id).length;
  const blocked = d.relations.some((r) => {
    if (r.kind !== "blocks" || r.other_id !== task.id) return false;
    const blocker = d.tasks.find((x) => x.id === r.task_id);
    const col = blocker && d.columns.find((c) => c.id === blocker.column_id);
    return blocker && !col?.is_done;
  });

  return (
    <>
      {blocked && (
        <span className="chip text-due-overdue" title={t("task.blocked")}>
          <Lock />
        </span>
      )}
      {task.recurrence && (
        <span className="chip w-5.5 justify-center px-0" title={t("task.recurring")}>
          <Repeat className="text-chip-icon" />
        </span>
      )}
      {subs.length > 0 && (
        <span className="chip tabular-nums" title={t("task.subtasks")}>
          <ProgressGlyph done={doneSubs} total={subs.length} />
          {doneSubs}/{subs.length}
        </span>
      )}
      {files > 0 && (
        <span className="chip tabular-nums" title={t("task.attachments")}>
          <Paperclip className="text-chip-icon" />
          {files}
        </span>
      )}
    </>
  );
}

/** Eigene Felder, die auf der Karte angezeigt werden sollen. */
export function CardFields({ task }: { task: Task }) {
  const fields = useStore((s) => s.data.fields);
  const values = useStore((s) => s.data.field_values);
  const shown = fields.filter((f) => f.project_id === task.project_id && f.show_on_card);
  const items = shown
    .map((f) => ({ f, v: values.find((v) => v.task_id === task.id && v.field_id === f.id)?.value }))
    .filter((x) => x.v)
    .slice(0, 2);
  if (items.length === 0) return null;
  return (
    <>
      {items.map(({ f, v }) => (
        <span key={f.id} className="chip max-w-40" title={f.name}>
          <span className="text-chip-muted">{f.name}</span>
          <span className="truncate">{f.type === "checkbox" ? (v === "1" ? "✓" : "✗") : v}</span>
        </span>
      ))}
    </>
  );
}
