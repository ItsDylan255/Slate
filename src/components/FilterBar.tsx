import { Check, ChevronDown, Search, Tag, X } from "lucide-react";
import { PriorityMarks } from "./task/bits";
import { EMPTY_FILTERS, useStore, type DueFilter } from "../store";
import { PRIORITIES } from "../lib/priority";
import { filtersActive } from "../lib/filter";
import { MenuItem, Popover, usePopover } from "./ui/Popover";
import { useT, type TKey } from "../i18n";

const DUE_OPTIONS: { value: DueFilter; label: TKey }[] = [
  { value: "all", label: "filter.dueAll" },
  { value: "overdue", label: "filter.overdue" },
  { value: "today", label: "filter.today" },
  { value: "week", label: "filter.week" },
  { value: "none", label: "filter.noDate" },
];

/** Suche + Filter für die aktuelle Ansicht. */
export function FilterBar() {
  const t = useT();
  const f = useStore((s) => s.filters);
  const labels = useStore((s) => s.data.labels);
  const set = useStore((s) => s.set);
  const update = (patch: Partial<typeof f>) => set({ filters: { ...f, ...patch } });
  const prio = usePopover();
  const lab = usePopover();
  const due = usePopover();

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const Chip = ({ active, onClick, children }: { active: boolean; onClick: (e: React.MouseEvent<HTMLElement>) => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium shadow-xs/5 transition-colors [&_svg]:size-3.5 [&_svg]:opacity-70 ${
        active
          ? "border-chip-border-hover bg-accent text-foreground"
          : "border-input bg-background text-foreground hover:bg-accent dark:bg-white/[0.03]"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-4">
      <div className="relative w-56">
        <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground/70" />
        <input
          id="filter-search"
          className="input h-7 pl-8 text-[13px]"
          placeholder={t("filter.search")}
          value={f.text}
          onChange={(e) => update({ text: e.target.value })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              update({ text: "" });
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>

      <Chip active={f.priorities.length > 0} onClick={prio.open}>
        {t("task.priority")}
        {f.priorities.length > 0 && ` · ${f.priorities.length}`} <ChevronDown size={12} />
      </Chip>
      {prio.anchor && (
        <Popover anchor={prio.anchor} onClose={prio.close} className="w-44">
          {PRIORITIES.map((p) => (
            <MenuItem
              key={p.value}
              icon={<PriorityMarks priority={p.value} />}
              right={f.priorities.includes(p.value) && <Check size={13} />}
              onClick={() => update({ priorities: toggle(f.priorities, p.value) })}
            >
              {t(p.label)}
            </MenuItem>
          ))}
        </Popover>
      )}

      <Chip active={f.labels.length > 0} onClick={lab.open}>
        <Tag size={12} /> {t("task.labels")}
        {f.labels.length > 0 && ` · ${f.labels.length}`} <ChevronDown size={12} />
      </Chip>
      {lab.anchor && (
        <Popover anchor={lab.anchor} onClose={lab.close} className="w-52">
          {labels.length === 0 && <p className="p-2 text-xs text-muted-foreground">{t("labels.none")}</p>}
          {labels.map((l) => (
            <MenuItem
              key={l.id}
              icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />}
              right={f.labels.includes(l.id) && <Check size={13} />}
              onClick={() => update({ labels: toggle(f.labels, l.id) })}
            >
              {l.name}
            </MenuItem>
          ))}
        </Popover>
      )}

      <Chip active={f.due !== "all"} onClick={due.open}>
        {t(DUE_OPTIONS.find((o) => o.value === f.due)!.label)} <ChevronDown size={12} />
      </Chip>
      {due.anchor && (
        <Popover anchor={due.anchor} onClose={due.close} className="w-44">
          {DUE_OPTIONS.map((o) => (
            <MenuItem key={o.value} active={f.due === o.value} onClick={() => (update({ due: o.value }), due.close())}>
              {t(o.label)}
            </MenuItem>
          ))}
        </Popover>
      )}

      <Chip active={f.hideDone} onClick={() => update({ hideDone: !f.hideDone })}>
        {f.hideDone && <Check size={12} />} {t("filter.hideDone")}
      </Chip>

      {filtersActive(f) && (
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => set({ filters: EMPTY_FILTERS })}>
          <X size={12} /> {t("filter.reset")}
        </button>
      )}
    </div>
  );
}
