import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Copy, Trash2 } from "lucide-react";
import { taskKey, useStore } from "../../store";
import { Modal } from "../ui/Modal";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Description } from "./Description";
import { Subtasks } from "./Subtasks";
import { Relations } from "./Relations";
import { Links } from "./Links";
import { Attachments } from "./Attachments";
import { Activity } from "./Activity";
import { Properties } from "./Properties";
import { CreateMoreToggle } from "../task/CreateMoreToggle";
import { useT } from "../../i18n";

/**
 * Fenster einer Aufgabe – zum Bearbeiten und zum Neu-Anlegen (gleiches Fenster).
 * Alle Änderungen werden sofort gespeichert. Eine neue Aufgabe ohne Titel wird beim Schließen verworfen.
 */
export function TaskDialog({ taskId }: { taskId: string }) {
  const t = useT();
  const task = useStore((s) => s.data.tasks.find((x) => x.id === taskId));
  const projects = useStore((s) => s.data.projects);
  const isNew = useStore((s) => s.draftTaskId === taskId);
  const createMore = useStore((s) => s.createMore);
  const { set, updateTask, deleteTasks, duplicateTask, startNewTask } = useStore.getState();
  const [title, setTitle] = useState(task?.title ?? "");
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(task?.title ?? "");
    if (isNew) titleRef.current?.focus();
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTitle = async () => {
    if (task && title.trim() && title.trim() !== task.title) await updateTask(task.id, { title: title.trim() });
  };

  const close = async () => {
    if (isNew && !title.trim() && task) {
      // Neue Aufgabe ohne Titel -> nicht anlegen
      set({ openTaskId: null, draftTaskId: null });
      await deleteTasks([task.id]);
      return;
    }
    await saveTitle();
    set({ openTaskId: null, draftTaskId: null });
  };

  /** "Erstellen": Aufgabe behalten. Mit "Weiter erstellen" öffnet sich direkt die nächste. */
  const create = async () => {
    if (!task || !title.trim()) {
      titleRef.current?.focus();
      return;
    }
    await saveTitle();
    if (createMore) await startNewTask({ projectId: task.project_id, columnId: task.column_id });
    else set({ openTaskId: null, draftTaskId: null });
  };

  if (!task) return null;
  const project = projects.find((p) => p.id === task.project_id);

  return (
    <Modal
      size="xl"
      noPadding
      onClose={close}
      title={
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {project?.name}
          <span className="text-muted-foreground/50">/</span>
          {isNew ? (
            <span className="text-foreground">{t("common.newTask")}</span>
          ) : (
            <span className="font-mono text-xs text-foreground">{taskKey(task, projects)}</span>
          )}
          {task.archived ? <span className="chip ml-1">{t("nav.archive")}</span> : null}
        </span>
      }
      headerRight={
        <div className="flex gap-1">
          <CreateMoreToggle />
          {!isNew && (
            <>
              <button className="btn-icon" title={t("menu.duplicate")} onClick={() => duplicateTask(task.id)}>
                <Copy size={14} />
              </button>
              <button
                className="btn-icon"
                title={task.archived ? t("archive.restore") : t("menu.archive")}
                onClick={() => updateTask(task.id, { archived: task.archived ? 0 : 1 })}
              >
                {task.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </button>
              <ConfirmButton className="btn-icon" title={t("common.delete")} confirmText={t("common.confirmDelete")} onConfirm={() => deleteTasks([task.id])}>
                <Trash2 size={14} />
              </ConfirmButton>
            </>
          )}
        </div>
      }
    >
      <div className="flex min-h-full flex-col">
        <div className="flex flex-1 items-stretch">
          <div className="min-w-0 flex-1 space-y-8 px-8 py-7">
            <textarea
              ref={titleRef}
              rows={1}
              autoFocus={isNew}
              className="w-full resize-none bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60 [field-sizing:content]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => !isNew && saveTitle()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (isNew) create();
                  else (e.target as HTMLTextAreaElement).blur();
                }
                if (e.key === "Escape") close();
              }}
              placeholder={t("task.title")}
            />
            <Description key={task.id} task={task} />
            <Subtasks taskId={task.id} />
            <Attachments taskId={task.id} />
            <Relations taskId={task.id} />
            <Links taskId={task.id} />
            {!isNew && (
              <div className="border-t border-border pt-5">
                <Activity taskId={task.id} />
              </div>
            )}
          </div>
          <aside className="w-80 shrink-0 border-l border-border bg-sidebar/40 px-5 py-6">
            <Properties task={task} />
          </aside>
        </div>
        {isNew && (
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-popover px-6 py-3">
            <button className="btn-ghost" onClick={close}>
              {t("common.cancel")}
            </button>
            <button className="btn-primary" onClick={create} disabled={!title.trim()}>
              {t("common.create")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
