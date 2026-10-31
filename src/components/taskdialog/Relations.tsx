import { useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { isDone, taskKey, useStore } from "../../store";
import type { RelationKind } from "../../lib/types";
import { matchesText } from "../../lib/filter";
import { Popover, usePopover } from "../ui/Popover";
import { Select } from "../ui/Select";
import { useT, type TKey } from "../../i18n";

// Jede Beziehung wird einmal gespeichert und aus beiden Richtungen passend benannt.
const LABELS: Record<RelationKind, { out: TKey; in: TKey }> = {
  blocks: { out: "rel.blocks", in: "rel.blockedBy" },
  relates: { out: "rel.relates", in: "rel.relates" },
  duplicates: { out: "rel.duplicates", in: "rel.duplicatedBy" },
};

type Choice = { kind: RelationKind; reverse: boolean; label: TKey };
const CHOICES: Choice[] = [
  { kind: "blocks", reverse: false, label: "rel.blocks" },
  { kind: "blocks", reverse: true, label: "rel.blockedBy" },
  { kind: "relates", reverse: false, label: "rel.relates" },
  { kind: "duplicates", reverse: false, label: "rel.duplicates" },
];

export function Relations({ taskId }: { taskId: string }) {
  const t = useT();
  const d = useStore((s) => s.data);
  const { addRelation, remove, set } = useStore.getState();
  const pop = usePopover();
  const [choice, setChoice] = useState<Choice>(CHOICES[0]);
  const [q, setQ] = useState("");

  const rels = d.relations
    .filter((r) => r.task_id === taskId || r.other_id === taskId)
    .map((r) => {
      const outgoing = r.task_id === taskId;
      const other = d.tasks.find((x) => x.id === (outgoing ? r.other_id : r.task_id));
      return other && { r, other, label: outgoing ? LABELS[r.kind].out : LABELS[r.kind].in };
    })
    .filter(Boolean) as { r: (typeof d.relations)[number]; other: (typeof d.tasks)[number]; label: TKey }[];

  const candidates = d.tasks
    .filter((x) => x.id !== taskId && matchesText(x, q, taskKey(x, d.projects)))
    .slice(0, 8);

  const pick = async (otherId: string) => {
    if (choice.reverse) await addRelation(otherId, taskId, choice.kind);
    else await addRelation(taskId, otherId, choice.kind);
    pop.close();
    setQ("");
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="section-title">{t("task.relations")}</h3>
        <button className="btn-icon h-5 w-5" onClick={pop.open} title={t("task.addRelation")}>
          <Plus size={12} />
        </button>
      </div>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close} className="w-80">
          <div className="space-y-2 p-1">
            <Select value={String(CHOICES.indexOf(choice))} onChange={(v) => setChoice(CHOICES[Number(v)])} options={CHOICES.map((c, i) => ({ value: String(i), label: t(c.label) + " …" }))} />
            <input
              autoFocus
              className="input py-1 text-xs"
              placeholder={t("task.searchTask")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div>
              {candidates.map((x) => (
                <button
                  key={x.id}
                  onClick={() => pick(x.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <span className="font-mono text-muted-foreground/70">{taskKey(x, d.projects)}</span>
                  <span className="truncate">{x.title}</span>
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
      <div className="space-y-1">
        {rels.map(({ r, other, label }) => (
          <div key={r.id} className="group flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent">
            <Link2 size={13} className="text-muted-foreground/70" />
            <span className="w-28 shrink-0 text-xs text-muted-foreground">{t(label)}</span>
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => set({ openTaskId: other.id })}>
              <span className="font-mono text-xs text-muted-foreground/70">{taskKey(other, d.projects)}</span>
              <span className={`truncate ${isDone(other, d.columns) ? "text-muted-foreground/70 line-through" : ""}`}>{other.title}</span>
            </button>
            <button className="btn-icon h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => remove("relations", r.id)}>
              <X size={12} />
            </button>
          </div>
        ))}
        {rels.length === 0 && <p className="px-1 text-xs text-muted-foreground/70">{t("task.noRelations")}</p>}
      </div>
    </section>
  );
}
