import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, LayoutTemplate, Pencil, Plus, Trash2, X } from "lucide-react";
import { DEFAULT_COLUMNS, useStore } from "../../store";
import type { FieldType, Template } from "../../lib/types";
import { COLORS } from "../../lib/priority";
import { emptyTemplate, readTemplate, saveTemplate, tasksToText, templateFromProject, textToTasks } from "../../lib/templates";
import type { ImportProject } from "../../lib/importer";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Select } from "../ui/Select";
import { ColorDots } from "../taskdialog/LabelPicker";
import { useT, type TKey } from "../../i18n";

const FIELD_TYPES: { value: FieldType; label: TKey }[] = [
  { value: "text", label: "field.text" },
  { value: "number", label: "field.number" },
  { value: "date", label: "field.date" },
  { value: "select", label: "field.select" },
  { value: "checkbox", label: "field.checkbox" },
];

/** Einstellungen → Vorlagen: Liste, neu, aus Projekt, bearbeiten. */
export function TemplatesSettings() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const templates = useStore((s) => s.data.templates);
  const allProjects = useStore((s) => s.data.projects);
  const projects = allProjects.filter((p) => !p.archived);
  const [editing, setEditing] = useState<{ id: string | null; name: string; data: ImportProject } | null>(null);
  const [fromProject, setFromProject] = useState(projects[0]?.id ?? "");
  const [withTasks, setWithTasks] = useState(true);

  if (editing) return <TemplateEditor initial={editing} onClose={() => setEditing(null)} />;

  const summary = (p: ImportProject) =>
    [
      t("templates.columnsN", { n: p.columns?.length ?? DEFAULT_COLUMNS.length }),
      p.labels.length ? t("templates.labelsN", { n: p.labels.length }) : "",
      p.fields.length ? t("templates.fieldsN", { n: p.fields.length }) : "",
      p.tasks.length ? t("templates.tasksN", { n: p.tasks.length }) : "",
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("templates.hint")}</p>

      <div className="divide-y divide-border rounded-lg border border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <LayoutTemplate className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t("templates.standard")}</div>
            <div className="truncate text-xs text-muted-foreground">{DEFAULT_COLUMNS.map((c) => c[lang]).join(", ")}</div>
          </div>
          <span className="text-xs text-muted-foreground/70">{t("templates.builtIn")}</span>
        </div>
        {[...templates]
          .sort((a, b) => a.position - b.position)
          .map((tpl: Template) => {
            const data = readTemplate(tpl);
            return (
              <div key={tpl.id} className="flex items-center gap-3 px-4 py-3">
                <LayoutTemplate className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{tpl.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{summary(data)}</div>
                </div>
                <button className="btn-icon" title={t("common.edit")} onClick={() => setEditing({ id: tpl.id, name: tpl.name, data })}>
                  <Pencil size={13} />
                </button>
                <button className="btn-icon" title={t("templates.duplicate")} onClick={() => saveTemplate(null, `${tpl.name} (2)`, data)}>
                  <Copy size={13} />
                </button>
                <ConfirmButton className="btn-icon" confirmText="?" onConfirm={() => useStore.getState().remove("templates", tpl.id)}>
                  <Trash2 size={13} />
                </ConfirmButton>
              </div>
            );
          })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary"
          onClick={() => setEditing({ id: null, name: "", data: { ...emptyTemplate(), columns: DEFAULT_COLUMNS.map((c) => ({ name: c[lang], done: c.done })) } })}
        >
          <Plus size={14} /> {t("templates.new")}
        </button>
        {projects.length > 0 && (
          <>
            <span className="ml-2 text-xs text-muted-foreground">{t("templates.orFrom")}</span>
            <Select value={fromProject} onChange={setFromProject} options={projects.map((p) => ({ value: p.id, label: p.name }))} className="w-44" />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={withTasks} onChange={(e) => setWithTasks(e.target.checked)} /> {t("templates.withTasks")}
            </label>
            <button
              className="btn-outline"
              disabled={!fromProject}
              onClick={() => {
                const name = projects.find((p) => p.id === fromProject)?.name ?? "";
                setEditing({ id: null, name, data: templateFromProject(fromProject, withTasks) });
              }}
            >
              {t("templates.create")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TemplateEditor({ initial, onClose }: { initial: { id: string | null; name: string; data: ImportProject }; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.data.description);
  const [columns, setColumns] = useState(initial.data.columns ?? []);
  const [labels, setLabels] = useState(initial.data.labels);
  const [fields, setFields] = useState(initial.data.fields);
  const [tasksText, setTasksText] = useState(() => tasksToText(initial.data.tasks));
  const [newColumn, setNewColumn] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newField, setNewField] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("text");

  const move = <T,>(list: T[], i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    return next;
  };

  const save = async () => {
    // Text nur neu einlesen, wenn er geändert wurde (sonst bleiben z. B. Feldwerte erhalten)
    const tasks = tasksText === tasksToText(initial.data.tasks) ? initial.data.tasks : textToTasks(tasksText);
    await saveTemplate(initial.id, name.trim(), {
      ...initial.data,
      description,
      columns: columns.length ? columns : null,
      labels,
      fields,
      tasks,
    });
    onClose();
  };

  return (
    <div className="space-y-5" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold">{initial.id ? t("templates.edit") : t("templates.new")}</h3>
        <button className="btn-icon" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("templates.name")}</label>
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("templates.namePlaceholder")} />
        </div>
        <div>
          <label className="label">{t("project.description")}</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      {/* Spalten */}
      <div>
        <label className="label">{t("templates.columns")}</label>
        <div className="space-y-1">
          {columns.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input py-1" value={c.name} onChange={(e) => setColumns(columns.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title={t("templates.doneHint")}>
                <input type="checkbox" checked={c.done} onChange={(e) => setColumns(columns.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
                {t("templates.done")}
              </label>
              <button className="btn-icon shrink-0" disabled={i === 0} onClick={() => setColumns(move(columns, i, -1))}>
                <ArrowUp size={13} />
              </button>
              <button className="btn-icon shrink-0" disabled={i === columns.length - 1} onClick={() => setColumns(move(columns, i, 1))}>
                <ArrowDown size={13} />
              </button>
              <button className="btn-icon shrink-0" onClick={() => setColumns(columns.filter((_, j) => j !== i))}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newColumn.trim()) setColumns([...columns, { name: newColumn.trim(), done: false }]);
              setNewColumn("");
            }}
          >
            <input className="input py-1" placeholder={t("templates.newColumn")} value={newColumn} onChange={(e) => setNewColumn(e.target.value)} />
            <button className="btn-outline shrink-0" disabled={!newColumn.trim()}>
              {t("common.add")}
            </button>
          </form>
        </div>
      </div>

      {/* Labels */}
      <div>
        <label className="label">{t("task.labels")}</label>
        <div className="space-y-2">
          {labels.map((l, i) => (
            <div key={i} className="flex items-center gap-3">
              <input className="input w-40 py-1" value={l.name} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <div className="flex-1">
                <ColorDots value={l.color ?? COLORS[0]} onChange={(c) => setLabels(labels.map((x, j) => (j === i ? { ...x, color: c } : x)))} />
              </div>
              <button className="btn-icon shrink-0" onClick={() => setLabels(labels.filter((_, j) => j !== i))}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newLabel.trim()) setLabels([...labels, { name: newLabel.trim(), color: COLORS[(labels.length + 1) % COLORS.length] }]);
              setNewLabel("");
            }}
          >
            <input className="input py-1" placeholder={t("labels.newName")} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <button className="btn-outline shrink-0" disabled={!newLabel.trim()}>
              {t("common.add")}
            </button>
          </form>
        </div>
      </div>

      {/* Eigene Felder */}
      <div>
        <label className="label">{t("project.fields")}</label>
        <div className="space-y-1">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input py-1" value={f.name} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{t(FIELD_TYPES.find((x) => x.value === f.type)!.label)}</span>
              {f.type === "select" && (
                <input
                  className="input py-1 text-xs"
                  placeholder={t("field.optionsPlaceholder")}
                  defaultValue={f.options.join(", ")}
                  onBlur={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) } : x)))}
                />
              )}
              <button className="btn-icon shrink-0" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newField.trim()) setFields([...fields, { name: newField.trim(), type: newFieldType, options: [], show_on_card: false }]);
              setNewField("");
            }}
          >
            <input className="input py-1" placeholder={t("field.name")} value={newField} onChange={(e) => setNewField(e.target.value)} />
            <Select value={newFieldType} onChange={setNewFieldType} options={FIELD_TYPES.map((f) => ({ value: f.value, label: t(f.label) }))} className="w-36" />
            <button className="btn-outline shrink-0" disabled={!newField.trim()}>
              {t("common.add")}
            </button>
          </form>
        </div>
      </div>

      {/* Aufgaben */}
      <div>
        <label className="label">{t("templates.tasks")}</label>
        <textarea
          className="input min-h-36 resize-y font-mono text-xs leading-relaxed"
          value={tasksText}
          onChange={(e) => setTasksText(e.target.value)}
          placeholder={t("templates.tasksPlaceholder")}
          spellCheck={false}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("templates.tasksHint")}</p>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button className="btn-ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button className="btn-primary" disabled={!name.trim()} onClick={save}>
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
