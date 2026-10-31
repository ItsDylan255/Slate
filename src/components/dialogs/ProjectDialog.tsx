import { useState } from "react";
import { Archive, Check, Plus, Trash2 } from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useStore } from "../../store";
import type { FieldType } from "../../lib/types";
import { COLORS } from "../../lib/priority";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { useT, type TKey } from "../../i18n";

const keyFromName = (name: string) =>
  name
    .replace(/[^A-Za-zÄÖÜäöü0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, _, all) => (all.length > 1 ? w[0] : w.slice(0, 3)))
    .join("")
    .slice(0, 4)
    .toUpperCase();

/** Projekt anlegen oder bearbeiten: Allgemein + eigene Felder. */
export function ProjectDialog() {
  const t = useT();
  const req = useStore((s) => s.projectDialog)!;
  const project = useStore((s) => s.data.projects.find((p) => p.id === req.projectId));
  const { set, createProject, patch, deleteProject, go } = useStore.getState();
  const [tab, setTab] = useState<"general" | "fields">("general");

  const [name, setName] = useState(project?.name ?? "");
  const [key, setKey] = useState(project?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(!!project);
  const icon = project?.icon ?? "";
  const [color, setColor] = useState(project?.color ?? COLORS[0]);
  const [description, setDescription] = useState(project?.description ?? "");

  const close = () => set({ projectDialog: null });

  const save = async () => {
    if (!name.trim()) return;
    const values = { name: name.trim(), key: key.trim().toUpperCase(), icon, color, description: description.trim() };
    if (project) await patch("projects", project.id, values);
    else {
      const id = await createProject(values);
      go({ kind: "project", projectId: id, tab: "board" });
    }
    close();
  };

  return (
    <Modal title={project ? t("project.settings") : t("project.new")} onClose={close} size="md">
      {project && (
        <div className="-mt-2 mb-4 flex gap-1 border-b border-border">
          {(["general", "fields"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-3 pb-2 text-sm ${tab === id ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}
            >
              {t(id === "general" ? "project.general" : "project.fields")}
            </button>
          ))}
        </div>
      )}

      {tab === "general" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="space-y-4"
        >
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div>
              <label className="label">{t("project.name")}</label>
              <input
                autoFocus
                className="input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!keyTouched) setKey(keyFromName(e.target.value));
                }}
                placeholder={t("project.namePlaceholder")}
              />
            </div>
            <div>
              <label className="label" title={t("project.keyHint")}>
                {t("project.key")}
              </label>
              <input
                className="input font-mono uppercase"
                maxLength={6}
                value={key}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value.replace(/[^A-Za-z0-9]/g, ""));
                }}
                placeholder="WEB"
              />
            </div>
          </div>
          <div>
            <label className="label">{t("project.description")}</label>
            <textarea className="input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("project.color")}</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white transition hover:scale-110"
                  style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--popover), 0 0 0 4px ${c}` : undefined }}
                >
                  {color === c && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4 ">
            {project ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    await patch("projects", project.id, { archived: 1 });
                    go({ kind: "home" });
                    close();
                  }}
                >
                  <Archive size={14} /> {t("menu.archive")}
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={async () => {
                    if (await ask(t("project.confirmDelete", { name: project.name }), { kind: "warning" })) {
                      await deleteProject(project.id);
                      go({ kind: "home" });
                      close();
                    }
                  }}
                >
                  <Trash2 size={14} /> {t("common.delete")}
                </button>
              </div>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={close}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn-primary" disabled={!name.trim()}>
                {project ? t("common.save") : t("common.create")}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <FieldsEditor projectId={project!.id} />
      )}
    </Modal>
  );
}

const FIELD_TYPES: { value: FieldType; label: TKey }[] = [
  { value: "text", label: "field.text" },
  { value: "number", label: "field.number" },
  { value: "date", label: "field.date" },
  { value: "select", label: "field.select" },
  { value: "checkbox", label: "field.checkbox" },
];

function FieldsEditor({ projectId }: { projectId: string }) {
  const t = useT();
  const fields = useStore((s) => s.data.fields)
    .filter((f) => f.project_id === projectId)
    .sort((a, b) => a.position - b.position);
  const { createField, patch, remove } = useStore.getState();
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");

  const parseOptions = (s: string) => s.split(",").map((o) => o.trim()).filter(Boolean);

  const add = async () => {
    if (!name.trim()) return;
    await createField(projectId, name.trim(), type, parseOptions(options));
    setName("");
    setOptions("");
  };

  return (
    <div className="space-y-4" onKeyDown={(e) => e.stopPropagation()}>
      <p className="text-sm text-muted-foreground">{t("field.hint")}</p>
      <div className="space-y-2">
        {fields.map((f) => (
          <div key={f.id} className="rounded-lg border border-border p-3 ">
            <div className="flex items-center gap-2">
              <input
                className="input py-1"
                defaultValue={f.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== f.name && patch("fields", f.id, { name: e.target.value.trim() })}
              />
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{t(FIELD_TYPES.find((x) => x.value === f.type)!.label)}</span>
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title={t("field.showOnCardHint")}>
                <input type="checkbox" className="" checked={!!f.show_on_card} onChange={() => patch("fields", f.id, { show_on_card: f.show_on_card ? 0 : 1 })} />
                {t("field.showOnCard")}
              </label>
              <button className="btn-icon shrink-0" onClick={() => remove("fields", f.id)}>
                <Trash2 size={13} />
              </button>
            </div>
            {f.type === "select" && (
              <input
                className="input mt-2 py-1 text-xs"
                defaultValue={(JSON.parse(f.options) as string[]).join(", ")}
                placeholder={t("field.optionsPlaceholder")}
                onBlur={(e) => patch("fields", f.id, { options: JSON.stringify(parseOptions(e.target.value)) })}
              />
            )}
          </div>
        ))}
        {fields.length === 0 && <p className="text-sm text-muted-foreground/70">{t("field.none")}</p>}
      </div>

      <div className="space-y-2 rounded-lg bg-muted p-3 ">
        <div className="flex gap-2">
          <input className="input py-1" placeholder={t("field.name")} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Select className="w-40 shrink-0" value={type} onChange={setType} options={FIELD_TYPES.map((ft) => ({ value: ft.value, label: t(ft.label) }))} />
          <button className="btn-primary shrink-0 py-1" disabled={!name.trim()} onClick={add}>
            <Plus size={14} /> {t("common.add")}
          </button>
        </div>
        {type === "select" && (
          <input className="input py-1 text-xs" placeholder={t("field.optionsPlaceholder")} value={options} onChange={(e) => setOptions(e.target.value)} />
        )}
      </div>
    </div>
  );
}
