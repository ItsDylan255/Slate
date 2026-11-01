import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckSquare, Eye, RotateCcw, Square } from "lucide-react";
import { useStore, taskKey } from "../../store";
import { TABLES, type Data, type Row, type Task } from "../../lib/types";
import { formatDateTime, locale } from "../../lib/dates";
import { buildProjectExport, parseImport, runImport } from "../../lib/importer";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { DueBadge, LabelChip, PriorityMarks } from "../task/bits";
import { useT } from "../../i18n";

/** Gelöschte Zeilen ausblenden (wie im Store) */
function visibleData(tables: Partial<Data>): Data {
  const out = {} as Record<string, Row[]>;
  for (const t of TABLES) out[t] = ((tables[t] ?? []) as Row[]).filter((r) => !r.deleted);
  return out as unknown as Data;
}

/** Alte Version ansehen: Board eines Projekts so, wie es zum Zeitpunkt des Backups war (nur lesen). */
export function BackupViewer() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const view = useStore((s) => s.backupView)!;
  const { set, go } = useStore.getState();
  const close = () => set({ backupView: null });
  const d = useMemo(() => visibleData(view.tables), [view.tables]);
  const projects = d.projects.filter((p) => !p.archived).sort((a, b) => a.position - b.position);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const columns = d.columns.filter((c) => c.project_id === projectId).sort((a, b) => a.position - b.position);
  const tasks = d.tasks
    .filter((x) => x.project_id === projectId && x.title && (showArchived || !x.archived))
    .sort((a, b) => a.position - b.position);
  const backlog = tasks.filter((x) => x.column_id === null);
  const open = d.tasks.find((x) => x.id === openId);

  const restoreCopy = async () => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    setBusy(true);
    try {
      const parsed = parseImport(JSON.stringify(buildProjectExport(projectId, d))).projects;
      const name = `${project.name} (${format(view.at, lang === "de" ? "d.M.yyyy" : "M/d/yyyy")})`;
      const res = await runImport(parsed, { mode: "new", name });
      close();
      go({ kind: "project", projectId: res.projectId, tab: "board" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("versions.title", { time: formatDateTime(view.at, lang) })} onClose={close} size="xl">
      <div className="space-y-4" onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={projectId} onChange={(v) => (setProjectId(v), setOpenId(null))} options={projects.map((p) => ({ value: p.id, label: p.name }))} className="w-56" />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> {t("versions.showArchived")}
          </label>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Eye className="size-3.5" /> {t("versions.readOnly")}
          </span>
          <button className="btn-primary ml-auto" disabled={!projectId || busy} onClick={restoreCopy}>
            <RotateCcw size={14} /> {t("versions.restoreCopy")}
          </button>
        </div>

        {projects.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("versions.empty")}</p>
        ) : (
          <div className="flex gap-4">
            <div className="flex min-h-80 flex-1 gap-3 overflow-x-auto pb-2">
              {[...columns.map((c) => ({ id: c.id, name: c.name, list: tasks.filter((x) => x.column_id === c.id) })), ...(backlog.length ? [{ id: "backlog", name: "Backlog", list: backlog }] : [])].map(
                (col) => (
                  <div key={col.id} className="flex w-64 shrink-0 flex-col rounded-lg bg-muted/60 p-2">
                    <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium">
                      {col.name} <span className="text-muted-foreground">{col.list.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {col.list.map((x) => (
                        <ReadOnlyCard key={x.id} task={x} data={d} active={openId === x.id} onClick={() => setOpenId(openId === x.id ? null : x.id)} />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
            {open && <TaskDetails task={open} data={d} />}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("versions.hint")}</p>
      </div>
    </Modal>
  );
}

function ReadOnlyCard({ task, data, active, onClick }: { task: Task; data: Data; active: boolean; onClick: () => void }) {
  const labels = data.task_labels
    .filter((l) => l.task_id === task.id)
    .map((l) => data.labels.find((x) => x.id === l.label_id))
    .filter((l): l is NonNullable<typeof l> => !!l);
  const subs = data.subtasks.filter((s) => s.task_id === task.id);
  return (
    <button
      onClick={onClick}
      className={`w-full cursor-pointer rounded-md border bg-board-card p-2.5 text-left ${active ? "border-ring" : "border-border"} ${task.archived ? "opacity-60" : ""}`}
    >
      <div className="mb-1 text-[11px] text-muted-foreground">{taskKey(task, data.projects)}</div>
      <div className="text-[13px] font-medium">{task.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {task.priority !== "none" && <PriorityMarks priority={task.priority} />}
        {task.due_date && <DueBadge date={task.due_date} />}
        {subs.length > 0 && (
          <span className="chip">
            {subs.filter((s) => s.done).length}/{subs.length}
          </span>
        )}
        {labels.map((l) => (
          <LabelChip key={l.id} name={l.name} color={l.color} />
        ))}
      </div>
    </button>
  );
}

function TaskDetails({ task, data }: { task: Task; data: Data }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const subs = data.subtasks.filter((s) => s.task_id === task.id).sort((a, b) => a.position - b.position);
  const links = data.links.filter((l) => l.task_id === task.id);
  return (
    <div className="selectable w-72 shrink-0 space-y-3 rounded-lg border border-border p-4 text-sm">
      <div>
        <div className="text-[11px] text-muted-foreground">{taskKey(task, data.projects)}</div>
        <div className="font-semibold">{task.title}</div>
      </div>
      {(task.start_date || task.due_date) && (
        <div className="text-xs text-muted-foreground">
          {[task.start_date, task.due_date]
            .filter(Boolean)
            .map((x) => format(new Date(x!), "d. MMM yyyy", { locale: locale(lang) }))
            .join(" – ")}
        </div>
      )}
      {task.description && <p className="max-h-48 overflow-auto text-xs whitespace-pre-wrap text-muted-foreground">{task.description}</p>}
      {subs.length > 0 && (
        <div>
          <div className="section-title mb-1">{t("task.subtasks")}</div>
          {subs.map((s) => (
            <div key={s.id} className="flex items-center gap-2 py-0.5 text-xs">
              {s.done ? <CheckSquare className="size-3.5 text-muted-foreground" /> : <Square className="size-3.5 text-muted-foreground" />}
              <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.title}</span>
            </div>
          ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="space-y-0.5">
          {links.map((l) => (
            <div key={l.id} className="truncate text-xs text-info">
              {l.title || l.url}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
