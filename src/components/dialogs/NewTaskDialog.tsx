import { useRef, useState } from "react";
import { CheckCircle2, Circle, CircleDashed, Layout, X } from "lucide-react";
import { useStore } from "../../store";
import type { Priority } from "../../lib/types";
import { PRIORITIES } from "../../lib/priority";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { DatePicker } from "../ui/DatePicker";
import { PriorityMarks } from "../task/bits";
import { CreateMoreToggle } from "../task/CreateMoreToggle";
import { useT } from "../../i18n";

/**
 * Neue Aufgabe anlegen (N oder "+" in einer Spalte), wie Kaneos "Aufgabe erstellen".
 * Ist "Weiter erstellen" aktiv, bleibt der Dialog nach dem Anlegen offen und wird geleert.
 */
export function NewTaskDialog() {
  const t = useT();
  const req = useStore((s) => s.newTaskFor)!;
  const d = useStore((s) => s.data);
  const createMore = useStore((s) => s.createMore);
  const { set, createTask } = useStore.getState();
  const projects = d.projects.filter((p) => !p.archived);
  const titleRef = useRef<HTMLInputElement>(null);

  const [projectId, setProjectId] = useState(req.projectId ?? projects[0]?.id ?? "");
  const columns = d.columns.filter((c) => c.project_id === projectId);
  const defaultColumn =
    req.columnId === null ? "" : (columns.find((c) => c.id === req.columnId)?.id ?? columns.find((c) => !c.is_done)?.id ?? "");
  const [columnId, setColumnId] = useState(defaultColumn);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [due, setDue] = useState<string | null>(req.due ?? null);
  const [created, setCreated] = useState(0);

  const close = () => set({ newTaskFor: null });

  const submit = async () => {
    if (!title.trim() || !projectId) return;
    await createTask(projectId, columnId || null, title.trim(), { priority, due_date: due, description: description.trim() });
    if (createMore) {
      setTitle("");
      setDescription("");
      setCreated((n) => n + 1);
      titleRef.current?.focus();
    } else close();
  };

  if (projects.length === 0) {
    return (
      <Modal title={t("common.newTask")} onClose={close}>
        <p className="text-sm text-muted-foreground">{t("newTask.noProject")}</p>
        <button className="btn-primary mt-4" onClick={() => set({ newTaskFor: null, projectDialog: {} })}>
          {t("project.new")}
        </button>
      </Modal>
    );
  }

  return (
    <Modal title={t("common.newTask")} onClose={close} size="lg" headerRight={<CreateMoreToggle />} noPadding>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") close();
        }}
      >
        <div className="space-y-2 px-6 pt-5 pb-4">
          <input
            ref={titleRef}
            autoFocus
            className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
            placeholder={t("task.title")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            rows={3}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            placeholder={t("newTask.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-6 pb-4">
          <Select
            className="h-7 w-auto max-w-48 text-[13px]"
            value={projectId}
            onChange={(v) => {
              setProjectId(v);
              setColumnId(d.columns.find((c) => c.project_id === v && !c.is_done)?.id ?? "");
            }}
            options={projects.map((p) => ({ value: p.id, label: p.name, icon: <Layout className="size-3.5" /> }))}
          />
          <Select
            className="h-7 w-auto max-w-44 text-[13px]"
            value={columnId}
            onChange={setColumnId}
            options={[
              { value: "", label: t("view.backlog"), icon: <CircleDashed className="size-3.5" /> },
              ...columns.map((c) => ({ value: c.id, label: c.name, icon: c.is_done ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" /> })),
            ]}
          />
          <Select
            className="h-7 w-auto text-[13px]"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES.map((p) => ({
              value: p.value,
              label: t(p.label),
              icon: p.value === "none" ? <X className="size-3.5" /> : <PriorityMarks priority={p.value} />,
            }))}
          />
          <DatePicker className="h-7 w-auto text-[13px]" value={due} onChange={setDue} placeholder={t("task.dueDate")} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
          <span className="text-xs text-muted-foreground">{created > 0 ? t("newTask.created", { n: created }) : ""}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={close}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={!title.trim()}>
              {t("common.create")}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
