import { useState } from "react";
import { Trash2 } from "lucide-react";
import { labelsOf, useStore } from "../../store";
import { COLORS } from "../../lib/priority";
import { ConfirmButton } from "../ui/ConfirmButton";
import { ColorDots } from "../taskdialog/LabelPicker";
import { useT } from "../../i18n";

/** Labels eines Projekts verwalten (Projekt-Einstellungen → Labels). */
export function ProjectLabels({ projectId }: { projectId: string }) {
  const t = useT();
  const data = useStore((s) => s.data);
  const labels = labelsOf(data, projectId).sort((a, b) => a.name.localeCompare(b.name));
  const { createLabel, patch, remove } = useStore.getState();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);

  return (
    <div className="space-y-4" onKeyDown={(e) => e.stopPropagation()}>
      <p className="text-sm text-muted-foreground">{t("labels.hint")}</p>
      <div className="space-y-3">
        {labels.map((l) => (
          <div key={l.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
              <input
                className="input py-1"
                defaultValue={l.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && patch("labels", l.id, { name: e.target.value.trim() })}
              />
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground/70">
                {t("labels.used", { n: data.task_labels.filter((u) => u.label_id === l.id).length })}
              </span>
              <ConfirmButton className="btn-icon shrink-0" confirmText="?" onConfirm={() => remove("labels", l.id)}>
                <Trash2 size={13} />
              </ConfirmButton>
            </div>
            <div className="pl-[18px]">
              <ColorDots value={l.color} onChange={(c) => patch("labels", l.id, { color: c })} />
            </div>
          </div>
        ))}
        {labels.length === 0 && <p className="text-sm text-muted-foreground/70">{t("labels.none")}</p>}
      </div>
      <form
        className="space-y-2 border-t border-border pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await createLabel(projectId, name.trim(), color ?? COLORS[labels.length % COLORS.length]);
          setName("");
          setColor(null);
        }}
      >
        <div className="flex gap-2">
          <input className="input" placeholder={t("labels.newName")} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary shrink-0" disabled={!name.trim()}>
            {t("common.add")}
          </button>
        </div>
        <ColorDots value={color ?? COLORS[labels.length % COLORS.length]} onChange={setColor} />
      </form>
    </div>
  );
}
