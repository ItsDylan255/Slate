import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useStore } from "../../store";
import { COLORS } from "../../lib/priority";
import { useT } from "../../i18n";

/** Farbauswahl für Labels (Punkte in einer Reihe). */
export function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`size-4 cursor-pointer rounded-full ${value === c ? "ring-2 ring-ring ring-offset-1 ring-offset-popover" : ""}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

/**
 * Labels der Aufgabe(n) an-/abhaken, mit Suche, neuem Label und Farbwahl.
 * Labels gehören zum Projekt – bei Aufgaben aus mehreren Projekten wird nach Namen zusammengefasst.
 */
export function LabelPicker({ taskIds }: { taskIds: string[] }) {
  const t = useT();
  const tasks = useStore((s) => s.data.tasks);
  const allLabels = useStore((s) => s.data.labels);
  const links = useStore((s) => s.data.task_labels);
  const { toggleLabelByName, patch } = useStore.getState();
  const [q, setQ] = useState("");
  const [newColor, setNewColor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const projectIds = new Set(tasks.filter((x) => taskIds.includes(x.id)).map((x) => x.project_id));
  const projectLabels = allLabels.filter((l) => l.project_id && projectIds.has(l.project_id));
  // Pro Name ein Eintrag
  const byName = new Map<string, typeof projectLabels>();
  for (const l of projectLabels) byName.set(l.name.toLowerCase(), [...(byName.get(l.name.toLowerCase()) ?? []), l]);
  const labels = [...byName.values()].map((list) => list[0]).sort((a, b) => a.name.localeCompare(b.name));

  const filtered = labels.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = labels.some((l) => l.name.toLowerCase() === q.trim().toLowerCase());
  const has = (taskId: string, name: string) =>
    links.some((tl) => tl.task_id === taskId && byName.get(name.toLowerCase())?.some((l) => l.id === tl.label_id));
  const hasAll = (name: string) => taskIds.every((id) => has(id, name));

  const toggle = async (name: string, color?: string) => {
    const on = !hasAll(name);
    for (const id of taskIds) await toggleLabelByName(id, name, on, color);
  };

  const create = async () => {
    const name = q.trim();
    if (!name) return;
    for (const id of taskIds) await toggleLabelByName(id, name, true, newColor ?? COLORS[labels.length % COLORS.length]);
    setQ("");
    setNewColor(null);
  };

  const setColor = async (name: string, color: string) => {
    for (const l of byName.get(name.toLowerCase()) ?? []) await patch("labels", l.id, { color });
    setEditing(null);
  };

  return (
    <div className="space-y-1">
      <input
        autoFocus
        className="input py-1 text-xs"
        placeholder={t("labels.searchOrCreate")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            if (filtered.length === 1 && exact) toggle(filtered[0].name);
            else if (!exact) create();
          }
        }}
      />
      {filtered.map((l) => (
        <div key={l.id}>
          <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            <button
              className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full hover:ring-2 hover:ring-ring/50"
              title={t("labels.color")}
              onClick={() => setEditing(editing === l.id ? null : l.id)}
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            </button>
            <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left" onClick={() => toggle(l.name)}>
              <span className="flex-1 truncate">{l.name}</span>
              {hasAll(l.name) && <Check size={13} />}
            </button>
          </div>
          {editing === l.id && (
            <div className="px-2 pt-1 pb-2">
              <ColorDots value={l.color} onChange={(c) => setColor(l.name, c)} />
            </div>
          )}
        </div>
      ))}
      {q.trim() && !exact && (
        <div className="space-y-2 rounded-md px-2 py-1.5">
          <button onClick={create} className="flex w-full cursor-pointer items-center gap-2 text-left text-sm text-foreground">
            <Plus size={13} /> {t("labels.create", { name: q.trim() })}
          </button>
          <ColorDots value={newColor ?? COLORS[labels.length % COLORS.length]} onChange={setNewColor} />
        </div>
      )}
      {!q.trim() && labels.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{t("labels.none")}</p>}
    </div>
  );
}
