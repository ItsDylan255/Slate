import { CheckCircle2, Circle, CircleDashed, Layout, Plus, X } from "lucide-react";
import { Select } from "../ui/Select";
import { DatePicker } from "../ui/DatePicker";
import { useStore } from "../../store";
import type { Field, Priority, Task } from "../../lib/types";
import { PRIORITIES } from "../../lib/priority";
import { formatDateTime, parseRecurrence, type Frequency } from "../../lib/dates";
import { Popover, usePopover } from "../ui/Popover";
import { LabelChip, PriorityMarks } from "../task/bits";
import { LabelPicker } from "./LabelPicker";
import { useT, type TKey } from "../../i18n";

const FREQS: { value: Frequency | ""; label: TKey }[] = [
  { value: "", label: "rec.none" },
  { value: "daily", label: "rec.daily" },
  { value: "weekly", label: "rec.weekly" },
  { value: "monthly", label: "rec.monthly" },
  { value: "yearly", label: "rec.yearly" },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-2">
      <span className="w-24 shrink-0 pt-1.5 text-[13px] text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Rechte Spalte im Aufgaben-Dialog: alle Eigenschaften, die sofort gespeichert werden. */
export function Properties({ task }: { task: Task }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const d = useStore((s) => s.data);
  const { updateTask } = useStore.getState();
  const labelPop = usePopover();

  const columns = d.columns.filter((c) => c.project_id === task.project_id);
  const projects = d.projects.filter((p) => !p.archived || p.id === task.project_id);
  const labels = d.task_labels
    .filter((l) => l.task_id === task.id)
    .map((l) => d.labels.find((x) => x.id === l.label_id))
    .filter(Boolean);
  const fields = d.fields.filter((f) => f.project_id === task.project_id).sort((a, b) => a.position - b.position);
  const rec = parseRecurrence(task.recurrence);

  const dateInput = (value: string | null, onChange: (v: string | null) => void, withTime = false) => (
    <DatePicker variant="ghost" value={value} onChange={onChange} withTime={withTime} placeholder={t("common.empty")} />
  );

  return (
    <div className="space-y-1">
      <Row label={t("task.project")}>
        <Select
          variant="ghost"
          value={task.project_id}
          onChange={(v) => updateTask(task.id, { project_id: v })}
          options={projects.map((p) => ({ value: p.id, label: p.name, icon: <Layout className="size-3.5" /> }))}
        />
      </Row>

      <Row label={t("task.status")}>
        <Select
          variant="ghost"
          value={task.column_id ?? ""}
          onChange={(v) => updateTask(task.id, { column_id: v || null })}
          options={[
            { value: "", label: t("view.backlog"), icon: <CircleDashed className="size-3.5" /> },
            ...columns.map((c) => ({ value: c.id, label: c.name, icon: c.is_done ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" /> })),
          ]}
        />
      </Row>

      <Row label={t("task.priority")}>
        <div className="flex gap-0.5 pt-0.5">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              title={t(p.label)}
              onClick={() => updateTask(task.id, { priority: p.value as Priority })}
              className={`flex size-7 cursor-pointer items-center justify-center rounded-md ${task.priority === p.value ? "bg-accent ring-1 ring-chip-border-hover" : "hover:bg-accent"}`}
            >
              {p.value === "none" ? <X className="size-3.5 text-chip-icon" /> : <PriorityMarks priority={p.value} />}
            </button>
          ))}
        </div>
      </Row>

      <Row label={t("task.labels")}>
        <div className="flex flex-wrap items-center gap-1 pt-1">
          {labels.map((l) => (
            <LabelChip key={l!.id} name={l!.name} color={l!.color} />
          ))}
          <button className="btn-icon h-6 w-6" onClick={labelPop.open} title={t("labels.edit")}>
            <Plus size={13} />
          </button>
        </div>
        {labelPop.anchor && (
          <Popover anchor={labelPop.anchor} onClose={labelPop.close} className="w-60">
            <LabelPicker taskIds={[task.id]} />
          </Popover>
        )}
      </Row>

      <Row label={t("task.startDate")}>{dateInput(task.start_date, (v) => updateTask(task.id, { start_date: v }))}</Row>
      <Row label={t("task.dueDate")}>{dateInput(task.due_date, (v) => updateTask(task.id, { due_date: v }))}</Row>

      <Row label={t("task.reminder")}>{dateInput(task.reminder_at, (v) => updateTask(task.id, { reminder_at: v }), true)}</Row>

      <Row label={t("task.recurrence")}>
        <div className="flex gap-1">
          {rec && (
            <input
              type="number"
              min={1}
              className="input-ghost w-14"
              value={rec.interval}
              onChange={(e) =>
                updateTask(task.id, { recurrence: JSON.stringify({ ...rec, interval: Math.max(1, Number(e.target.value)) }) })
              }
            />
          )}
          <Select
            variant="ghost"
            value={rec?.freq ?? ""}
            onChange={(v) => updateTask(task.id, { recurrence: v ? JSON.stringify({ freq: v, interval: rec?.interval ?? 1 }) : null })}
            options={FREQS.map((fr) => ({ value: fr.value, label: t(fr.label) }))}
          />
        </div>
        {rec && <p className="mt-1 text-[11px] text-muted-foreground">{t("rec.hint")}</p>}
      </Row>

      {fields.map((f) => (
        <Row key={f.id} label={f.name}>
          <FieldInput field={f} taskId={task.id} />
        </Row>
      ))}

      <p className="pt-4 text-[11px] text-muted-foreground/70">{t("task.createdAt", { date: formatDateTime(task.created_at, lang) })}</p>
    </div>
  );
}

function FieldInput({ field, taskId }: { field: Field; taskId: string }) {
  const t = useT();
  const value = useStore((s) => s.data.field_values.find((v) => v.task_id === taskId && v.field_id === field.id)?.value ?? "");
  const setValue = (v: string) => useStore.getState().setFieldValue(taskId, field.id, v);

  switch (field.type) {
    case "checkbox":
      return <input type="checkbox" className="" checked={value === "1"} onChange={() => setValue(value === "1" ? "" : "1")} />;
    case "select": {
      const options = JSON.parse(field.options || "[]") as string[];
      return (
        <Select variant="ghost" value={value} onChange={setValue} options={[{ value: "", label: "–" }, ...options.map((o) => ({ value: o, label: o }))]} />
      );
    }
    case "date":
      return <DatePicker variant="ghost" value={value || null} onChange={(v) => setValue(v ?? "")} placeholder={t("common.empty")} />;
    default:
      return (
        <input
          key={value}
          type={field.type === "number" ? "number" : "text"}
          className="input-ghost"
          defaultValue={value}
          placeholder={t("common.empty")}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => e.target.value !== value && setValue(e.target.value)}
        />
      );
  }
}
