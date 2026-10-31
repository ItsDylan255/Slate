import { useState } from "react";
import { PriorityMarks } from "./task/bits";
import { Archive, CalendarDays, Columns3, Flag, Tag, Trash2, X } from "lucide-react";
import { useStore } from "../store";
import { PRIORITIES } from "../lib/priority";
import { MenuItem, Popover, usePopover } from "./ui/Popover";
import { LabelPicker } from "./taskdialog/LabelPicker";
import { ConfirmButton } from "./ui/ConfirmButton";
import { DatePicker } from "./ui/DatePicker";
import { useT } from "../i18n";

/** Leiste unten, sobald mehrere Aufgaben ausgewählt sind (Strg/Umschalt+Klick). */
export function BulkBar() {
  const t = useT();
  const selection = useStore((s) => s.selection);
  const d = useStore((s) => s.data);
  const { set, updateTasks, deleteTasks } = useStore.getState();
  const [open, setOpen] = useState<null | "status" | "priority" | "labels" | "due">(null);
  const pop = usePopover();

  if (selection.length === 0) return null;
  const tasks = d.tasks.filter((x) => selection.includes(x.id));
  const projectIds = new Set(tasks.map((x) => x.project_id));
  // Spalten nur anbieten, wenn alle Aufgaben aus demselben Projekt sind
  const columns = projectIds.size === 1 ? d.columns.filter((c) => projectIds.has(c.project_id)) : [];

  const openMenu = (which: typeof open) => (e: React.MouseEvent<HTMLElement>) => {
    setOpen(which);
    pop.open(e);
  };
  const close = () => {
    setOpen(null);
    pop.close();
  };

  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-popover p-1.5 shadow-2xl/10">
      <span className="px-2 text-sm font-medium whitespace-nowrap">{t("bulk.selected", { n: selection.length })}</span>
      <div className="mx-1 h-5 w-px bg-border" />
      {columns.length > 0 && (
        <button className="btn-ghost" onClick={openMenu("status")}>
          <Columns3 size={14} /> {t("task.status")}
        </button>
      )}
      <button className="btn-ghost" onClick={openMenu("priority")}>
        <Flag size={14} /> {t("task.priority")}
      </button>
      <button className="btn-ghost" onClick={openMenu("labels")}>
        <Tag size={14} /> {t("task.labels")}
      </button>
      <button className="btn-ghost" onClick={openMenu("due")}>
        <CalendarDays size={14} /> {t("task.dueDate")}
      </button>
      <button className="btn-ghost" onClick={() => updateTasks(selection, { archived: 1 }).then(() => set({ selection: [] }))}>
        <Archive size={14} /> {t("menu.archive")}
      </button>
      <ConfirmButton onConfirm={() => deleteTasks(selection)}>
        <Trash2 size={14} /> {t("common.delete")}
      </ConfirmButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <button className="btn-icon" onClick={() => set({ selection: [] })} title={t("bulk.clear")}>
        <X size={14} />
      </button>

      {pop.anchor && open && (
        <Popover anchor={pop.anchor} onClose={close} className="w-56">
          {open === "status" && (
            <>
              <MenuItem onClick={() => (updateTasks(selection, { column_id: null }), close())}>{t("view.backlog")}</MenuItem>
              {columns.map((c) => (
                <MenuItem key={c.id} onClick={() => (updateTasks(selection, { column_id: c.id }), close())}>
                  {c.name}
                </MenuItem>
              ))}
            </>
          )}
          {open === "priority" &&
            PRIORITIES.map((p) => (
              <MenuItem key={p.value} icon={<PriorityMarks priority={p.value} />} onClick={() => (updateTasks(selection, { priority: p.value }), close())}>
                {t(p.label)}
              </MenuItem>
            ))}
          {open === "labels" && <LabelPicker taskIds={selection} />}
          {open === "due" && (
            <div className="p-1">
              <DatePicker value={null} onChange={(v) => (updateTasks(selection, { due_date: v }), close())} />
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}
