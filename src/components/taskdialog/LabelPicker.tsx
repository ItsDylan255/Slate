import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useStore } from "../../store";
import { COLORS } from "../../lib/priority";
import { useT } from "../../i18n";

/** Liste aller Labels zum An-/Abhaken, mit Suche und "neues Label anlegen". */
export function LabelPicker({ taskIds }: { taskIds: string[] }) {
  const t = useT();
  const labels = useStore((s) => s.data.labels);
  const links = useStore((s) => s.data.task_labels);
  const { toggleLabel, createLabel } = useStore.getState();
  const [q, setQ] = useState("");

  const filtered = labels.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = labels.some((l) => l.name.toLowerCase() === q.trim().toLowerCase());
  const hasAll = (labelId: string) => taskIds.every((id) => links.some((l) => l.task_id === id && l.label_id === labelId));

  const toggle = async (labelId: string) => {
    const on = !hasAll(labelId);
    for (const id of taskIds) await toggleLabel(id, labelId, on);
  };

  const create = async () => {
    const name = q.trim();
    if (!name) return;
    const id = await createLabel(name, COLORS[labels.length % COLORS.length]);
    for (const tid of taskIds) await toggleLabel(tid, id, true);
    setQ("");
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
            if (filtered.length === 1 && exact) toggle(filtered[0].id);
            else if (!exact) create();
          }
        }}
      />
      {filtered.map((l) => (
        <button
          key={l.id}
          onClick={() => toggle(l.id)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
          <span className="flex-1 truncate">{l.name}</span>
          {hasAll(l.id) && <Check size={13} />}
        </button>
      ))}
      {q.trim() && !exact && (
        <button onClick={create} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent ">
          <Plus size={13} /> {t("labels.create", { name: q.trim() })}
        </button>
      )}
    </div>
  );
}
