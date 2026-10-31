import { addDays } from "date-fns";
import { PriorityMarks } from "./task/bits";
import { Archive, ArchiveRestore, CalendarDays, Columns3, Copy, ExternalLink, Flag, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { useStore } from "../store";
import { PRIORITIES } from "../lib/priority";
import { isoDate } from "../lib/dates";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "./ui/Popover";
import { LabelPicker } from "./taskdialog/LabelPicker";
import { useT } from "../i18n";

/**
 * Rechtsklick-Menü für Aufgaben. Ist die angeklickte Aufgabe Teil einer Mehrfachauswahl,
 * gelten die Aktionen für alle ausgewählten Aufgaben.
 */
export function TaskContextMenu() {
  const t = useT();
  const menu = useStore((s) => s.menu);
  const d = useStore((s) => s.data);
  const selection = useStore((s) => s.selection);
  const { set, updateTasks, deleteTasks, duplicateTask } = useStore.getState();
  const [sub, setSub] = useState<null | "status" | "priority" | "due" | "labels">(null);

  if (!menu) return null;
  const task = d.tasks.find((x) => x.id === menu.taskId);
  if (!task) return null;
  const ids = selection.includes(task.id) ? selection : [task.id];
  const multi = ids.length > 1;
  const columns = d.columns.filter((c) => c.project_id === task.project_id);
  const close = () => {
    setSub(null);
    set({ menu: null });
  };
  const run = (fn: () => unknown) => () => {
    fn();
    close();
  };

  const today = new Date();

  return (
    <Popover anchor={{ x: menu.x, y: menu.y }} onClose={close} className="w-60">
      {multi && <MenuLabel>{t("bulk.selected", { n: ids.length })}</MenuLabel>}
      {sub === null && (
        <>
          {!multi && (
            <MenuItem icon={<ExternalLink size={14} />} onClick={run(() => set({ openTaskId: task.id }))}>
              {t("menu.open")}
            </MenuItem>
          )}
          <MenuItem icon={<Columns3 size={14} />} onClick={() => setSub("status")} right="›">
            {t("task.status")}
          </MenuItem>
          <MenuItem icon={<Flag size={14} />} onClick={() => setSub("priority")} right="›">
            {t("task.priority")}
          </MenuItem>
          <MenuItem icon={<CalendarDays size={14} />} onClick={() => setSub("due")} right="›">
            {t("task.dueDate")}
          </MenuItem>
          <MenuItem icon={<Tag size={14} />} onClick={() => setSub("labels")} right="›">
            {t("task.labels")}
          </MenuItem>
          <MenuSeparator />
          {!multi && (
            <MenuItem icon={<Copy size={14} />} onClick={run(() => duplicateTask(task.id))}>
              {t("menu.duplicate")}
            </MenuItem>
          )}
          {task.archived ? (
            <MenuItem icon={<ArchiveRestore size={14} />} onClick={run(() => updateTasks(ids, { archived: 0 }))}>
              {t("archive.restore")}
            </MenuItem>
          ) : (
            <MenuItem icon={<Archive size={14} />} onClick={run(() => updateTasks(ids, { archived: 1 }))}>
              {t("menu.archive")}
            </MenuItem>
          )}
          <MenuItem danger icon={<Trash2 size={14} />} onClick={run(() => deleteTasks(ids))}>
            {multi ? t("bulk.delete", { n: ids.length }) : t("common.delete")}
          </MenuItem>
        </>
      )}

      {sub === "status" && (
        <>
          <MenuItem active={task.column_id === null} onClick={run(() => updateTasks(ids, { column_id: null }))}>
            {t("view.backlog")}
          </MenuItem>
          {columns.map((c) => (
            <MenuItem key={c.id} active={task.column_id === c.id} onClick={run(() => updateTasks(ids, { column_id: c.id }))}>
              {c.name}
            </MenuItem>
          ))}
        </>
      )}

      {sub === "priority" &&
        PRIORITIES.map((p) => (
          <MenuItem
            key={p.value}
            icon={<PriorityMarks priority={p.value} />}
            active={task.priority === p.value}
            onClick={run(() => updateTasks(ids, { priority: p.value }))}
          >
            {t(p.label)}
          </MenuItem>
        ))}

      {sub === "due" && (
        <>
          <MenuItem onClick={run(() => updateTasks(ids, { due_date: isoDate(today) }))}>{t("filter.today")}</MenuItem>
          <MenuItem onClick={run(() => updateTasks(ids, { due_date: isoDate(addDays(today, 1)) }))}>{t("due.tomorrow")}</MenuItem>
          <MenuItem onClick={run(() => updateTasks(ids, { due_date: isoDate(addDays(today, 7)) }))}>{t("due.nextWeek")}</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={run(() => updateTasks(ids, { due_date: null }))}>{t("due.remove")}</MenuItem>
        </>
      )}

      {sub === "labels" && <LabelPicker taskIds={ids} />}
    </Popover>
  );
}
