// Zentraler Zustand der App: alle Daten im Speicher + alle Aktionen, die Daten ändern.
// Jede Änderung wird sofort in SQLite gespeichert und danach (verzögert) mit Google Drive synchronisiert.
import { create } from "zustand";
import * as db from "./lib/db";
import { newId } from "./lib/db";
import type {
  Attachment,
  Column,
  Data,
  Field,
  FieldType,
  Label,
  Priority,
  Project,
  RelationKind,
  Row,
  TableName,
  Tables,
  Task,
  TaskLabel,
} from "./lib/types";
import { TABLES } from "./lib/types";
import { parseRecurrence, shiftDate } from "./lib/dates";
import { COLORS } from "./lib/priority";
import type { Lang } from "./i18n";

export type ProjectView = "board" | "list" | "backlog" | "calendar" | "gantt";
export type View =
  | { kind: "home" }
  | { kind: "my" }
  | { kind: "archive" }
  | { kind: "project"; projectId: string; tab: ProjectView };

export type DueFilter = "all" | "overdue" | "today" | "week" | "none";
export interface Filters {
  text: string;
  priorities: Priority[];
  labels: string[];
  due: DueFilter;
  hideDone: boolean;
}
export const EMPTY_FILTERS: Filters = { text: "", priorities: [], labels: [], due: "all", hideDone: false };

export type TaskPatch = Partial<
  Pick<
    Task,
    | "title"
    | "description"
    | "priority"
    | "start_date"
    | "due_date"
    | "reminder_at"
    | "recurrence"
    | "column_id"
    | "position"
    | "archived"
    | "project_id"
  >
>;

export const DEFAULT_COLUMNS: { de: string; en: string; done: boolean }[] = [
  { de: "Zu erledigen", en: "To do", done: false },
  { de: "In Arbeit", en: "In progress", done: false },
  { de: "In Review", en: "In review", done: false },
  { de: "Erledigt", en: "Done", done: true },
];

const emptyData = (): Data => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Data;

interface State {
  loaded: boolean;
  /** Alle Zeilen inkl. gelöschter (für Sync & Backup). */
  raw: Data;
  /** Nur nicht gelöschte Zeilen – das nutzt die Oberfläche. */
  data: Data;

  lang: Lang;
  dark: boolean;
  sidebarOpen: boolean;
  /** "Weiter erstellen": Dialog bleibt nach dem Anlegen einer Aufgabe offen */
  createMore: boolean;
  view: View;
  openTaskId: string | null;
  selection: string[];
  filters: Filters;
  paletteOpen: boolean;
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  projectDialog: { projectId?: string } | null;
  importDialog: { projectId?: string } | null;
  /** Alte Version (Backup) ansehen */
  backupView: { at: number; tables: Partial<Data> } | null;
  newTaskFor: { projectId?: string; columnId?: string | null; due?: string } | null;
  menu: { x: number; y: number; taskId: string } | null;
  /** Gerade neu angelegte Aufgabe, die noch im Fenster bearbeitet wird (ohne Titel = wird verworfen) */
  draftTaskId: string | null;
  syncStatus: { state: "off" | "idle" | "syncing" | "error"; last?: number; error?: string };

  /** Wird nach jeder Datenänderung aufgerufen (setzt der Sync). */
  onChange: () => void;

  init: () => Promise<void>;
  reload: () => Promise<void>;
  set: (partial: Partial<State>) => void;
  setLang: (lang: Lang) => void;
  setDark: (dark: boolean) => void;
  toggleSidebar: () => void;
  setCreateMore: (on: boolean) => void;
  go: (view: View) => void;

  // Allgemein
  save: <T extends TableName>(table: T, row: Tables[T]) => Promise<void>;
  patch: <T extends TableName>(table: T, id: string, fields: Partial<Tables[T]>) => Promise<void>;
  remove: (table: TableName, id: string) => Promise<void>;

  // Projekte
  createProject: (p: { name: string; color: string; icon: string; key: string; description: string }) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  reorderProjects: (ids: string[]) => Promise<void>;

  // Spalten
  createColumn: (projectId: string, name: string) => Promise<void>;
  deleteColumn: (id: string) => Promise<void>;
  reorderColumns: (ids: string[]) => Promise<void>;

  // Aufgaben
  createTask: (projectId: string, columnId: string | null, title: string, extra?: TaskPatch) => Promise<string>;
  /** Neue Aufgabe anlegen und im selben Fenster wie beim Bearbeiten öffnen */
  startNewTask: (req: { projectId?: string; columnId?: string | null; due?: string }) => Promise<void>;
  updateTask: (id: string, fields: TaskPatch) => Promise<void>;
  updateTasks: (ids: string[], fields: TaskPatch) => Promise<void>;
  deleteTasks: (ids: string[]) => Promise<void>;
  duplicateTask: (id: string) => Promise<void>;
  saveOrder: (order: { id: string; column_id: string | null }[]) => Promise<void>;
  archiveDone: (columnId: string) => Promise<void>;

  // Details
  toggleLabel: (taskId: string, labelId: string, on?: boolean) => Promise<void>;
  createLabel: (projectId: string, name: string, color: string) => Promise<string>;
  /** Label mit diesem Namen im Projekt der Aufgabe an-/abhaken (legt es bei Bedarf an) */
  toggleLabelByName: (taskId: string, name: string, on: boolean, color?: string) => Promise<void>;
  addSubtask: (taskId: string, title: string, dueDate?: string | null) => Promise<void>;
  reorderSubtasks: (ids: string[]) => Promise<void>;
  addComment: (taskId: string, body: string) => Promise<void>;
  addLink: (taskId: string, url: string, title: string) => Promise<void>;
  addRelation: (taskId: string, otherId: string, kind: RelationKind) => Promise<void>;
  addAttachment: (taskId: string, att: Pick<Attachment, "name" | "file" | "size">) => Promise<void>;
  createField: (projectId: string, name: string, type: FieldType, options: string[]) => Promise<void>;
  setFieldValue: (taskId: string, fieldId: string, value: string) => Promise<void>;

  log: (taskId: string, action: string, detail?: unknown) => Promise<void>;
}

const now = () => Date.now();
let creatingDraft = false;

function visible(raw: Data): Data {
  const out = {} as Record<TableName, Row[]>;
  for (const t of TABLES) out[t] = (raw[t] as Row[]).filter((r) => !r.deleted);
  out.projects.sort((a, b) => (a as Project).position - (b as Project).position);
  out.columns.sort((a, b) => (a as Column).position - (b as Column).position);
  out.tasks.sort((a, b) => (a as Task).position - (b as Task).position);
  return out as unknown as Data;
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* egal */
  }
}

const initialLang = (): Lang =>
  loadLocal<Lang | null>("lang", null) ?? (navigator.language.startsWith("de") ? "de" : "en");

export const useStore = create<State>((set, get) => {
  /** Ändert Zeilen im Speicher und berechnet die sichtbaren Daten neu. */
  const applyRows = <T extends TableName>(table: T, rows: Tables[T][]) => {
    const raw = { ...get().raw };
    const list = [...(raw[table] as Tables[T][])];
    for (const row of rows) {
      const i = list.findIndex((r) => r.id === row.id);
      if (i >= 0) list[i] = row;
      else list.push(row);
    }
    (raw as Record<TableName, Row[]>)[table] = list;
    set({ raw, data: visible(raw) });
  };

  const write = async <T extends TableName>(table: T, rows: Tables[T][]) => {
    if (rows.length === 0) return;
    await db.upsertMany(table, rows);
    applyRows(table, rows);
    get().onChange();
  };

  const find = <T extends TableName>(table: T, id: string) =>
    (get().raw[table] as Tables[T][]).find((r) => r.id === id);

  const softDelete = <T extends TableName>(table: T, pred: (r: Tables[T]) => boolean) => {
    const rows = (get().raw[table] as Tables[T][])
      .filter((r) => !r.deleted && pred(r))
      .map((r) => ({ ...r, deleted: 1, updated_at: now() }));
    return write(table, rows);
  };

  /**
   * Labels waren früher für alle Projekte gemeinsam. Jetzt gehört jedes Label zu einem Projekt:
   * ein altes Label wird in jedes Projekt kopiert, in dem es benutzt wird (unbenutzte in alle Projekte).
   * Die neuen IDs sind fest (Label-ID + Projekt-ID), damit mehrere PCs zum gleichen Ergebnis kommen.
   */
  const migrateGlobalLabels = async () => {
    const d = get().data;
    const old = d.labels.filter((l) => !l.project_id);
    if (!old.length) return;
    const projectOf = new Map(d.tasks.map((t) => [t.id, t.project_id]));
    const newLabels: Label[] = [];
    const links: TaskLabel[] = [];
    for (const l of old) {
      const used = d.task_labels.filter((tl) => tl.label_id === l.id);
      const projects = new Set(used.map((tl) => projectOf.get(tl.task_id)).filter((x): x is string => !!x));
      if (!projects.size) d.projects.filter((p) => !p.archived).forEach((p) => projects.add(p.id));
      for (const pid of projects) {
        const id = `${l.id}~${pid}`;
        newLabels.push({ ...l, id, project_id: pid, updated_at: now() });
        for (const tl of used.filter((x) => projectOf.get(x.task_id) === pid)) {
          links.push({ ...tl, deleted: 1, updated_at: now() });
          links.push({ id: `${tl.task_id}:${id}`, task_id: tl.task_id, label_id: id, updated_at: now(), deleted: 0 });
        }
      }
    }
    await write("labels", [...newLabels, ...old.map((l) => ({ ...l, deleted: 1, updated_at: now() }))]);
    await write("task_labels", links);
  };

  const columnName = (id: string | null) => (id ? (find("columns", id)?.name ?? "") : "Backlog");

  /** Wenn eine wiederkehrende Aufgabe erledigt wird: nächste Instanz anlegen. */
  const spawnRecurrence = async (task: Task) => {
    const r = parseRecurrence(task.recurrence);
    if (!r) return;
    const cols = get().data.columns.filter((c) => c.project_id === task.project_id);
    const target = cols.find((c) => !c.is_done) ?? cols[0];
    const newTaskId = await get().createTask(task.project_id, target?.id ?? null, task.title, {
      description: task.description,
      priority: task.priority,
      recurrence: task.recurrence,
      start_date: task.start_date ? shiftDate(task.start_date, r) : null,
      due_date: task.due_date ? shiftDate(task.due_date, r) : null,
    });
    // Labels, Unteraufgaben (zurückgesetzt) und eigene Felder mitnehmen
    const d = get().data;
    for (const tl of d.task_labels.filter((x) => x.task_id === task.id)) await get().toggleLabel(newTaskId, tl.label_id, true);
    for (const s of d.subtasks.filter((x) => x.task_id === task.id)) await get().addSubtask(newTaskId, s.title);
    for (const fv of d.field_values.filter((x) => x.task_id === task.id))
      await get().setFieldValue(newTaskId, fv.field_id, fv.value);
    // Die alte Instanz wiederholt sich nicht mehr selbst
    await write("tasks", [{ ...find("tasks", task.id)!, recurrence: null, updated_at: now() }]);
  };

  return {
    loaded: false,
    raw: emptyData(),
    data: emptyData(),
    lang: initialLang(),
    dark: loadLocal("dark", window.matchMedia("(prefers-color-scheme: dark)").matches),
    sidebarOpen: loadLocal("sidebarOpen", true),
    createMore: loadLocal("createMore", false),
    view: loadLocal<View>("view", { kind: "home" }),
    openTaskId: null,
    selection: [],
    filters: EMPTY_FILTERS,
    paletteOpen: false,
    settingsOpen: false,
    shortcutsOpen: false,
    projectDialog: null,
    importDialog: null,
    backupView: null,
    newTaskFor: null,
    menu: null,
    draftTaskId: null,
    syncStatus: { state: "off" },
    onChange: () => {},

    init: async () => {
      await get().reload();
      // Entwürfe ohne Titel (App wurde beim Anlegen geschlossen) aufräumen
      const empty = get().data.tasks.filter((x) => !x.title).map((x) => x.id);
      if (empty.length) await get().deleteTasks(empty);
      await migrateGlobalLabels();
      // Gespeicherte Ansicht prüfen (Projekt könnte gelöscht sein)
      const v = get().view;
      if (v.kind === "project" && !get().data.projects.some((p) => p.id === v.projectId)) get().go({ kind: "home" });
      set({ loaded: true });
    },

    reload: async () => {
      const raw = await db.loadAll();
      set({ raw, data: visible(raw) });
    },

    set: (partial) => set(partial),
    setLang: (lang) => {
      saveLocal("lang", lang);
      set({ lang });
    },
    setDark: (dark) => {
      saveLocal("dark", dark);
      set({ dark });
    },
    toggleSidebar: () => {
      saveLocal("sidebarOpen", !get().sidebarOpen);
      set({ sidebarOpen: !get().sidebarOpen });
    },
    setCreateMore: (on) => {
      saveLocal("createMore", on);
      set({ createMore: on });
    },
    go: (view) => {
      saveLocal("view", view);
      // In "Meine Aufgaben" sind erledigte Aufgaben standardmäßig ausgeblendet
      set({ view, selection: [], filters: view.kind === "my" ? { ...EMPTY_FILTERS, hideDone: true } : EMPTY_FILTERS });
    },

    save: (table, row) => write(table, [{ ...row, updated_at: now() }]),
    patch: async (table, id, fields) => {
      const row = find(table, id);
      if (row) await write(table, [{ ...row, ...fields, updated_at: now() }]);
    },
    remove: async (table, id) => {
      if (table === "tasks") await get().deleteTasks([id]);
      else await softDelete(table, (r) => r.id === id);
    },

    // ---------- Projekte ----------

    createProject: async ({ name, color, icon, key, description }) => {
      const id = newId();
      const lang = get().lang;
      const position = Math.max(0, ...get().data.projects.map((p) => p.position)) + 1;
      await write("projects", [
        { id, name, color, icon, key, description, position, archived: 0, favorite: 0, updated_at: now(), deleted: 0 },
      ]);
      await write(
        "columns",
        DEFAULT_COLUMNS.map((c, i) => ({
          id: newId(),
          project_id: id,
          name: c[lang],
          position: i,
          is_done: c.done ? 1 : 0,
          updated_at: now(),
          deleted: 0,
        })),
      );
      return id;
    },

    deleteProject: async (id) => {
      const taskIds = get().data.tasks.filter((t) => t.project_id === id).map((t) => t.id);
      await get().deleteTasks(taskIds);
      await softDelete("columns", (c) => c.project_id === id);
      await softDelete("fields", (f) => f.project_id === id);
      await softDelete("projects", (p) => p.id === id);
    },

    reorderProjects: async (ids) => {
      const rows = ids
        .map((id, i) => ({ row: find("projects", id)!, i }))
        .filter(({ row, i }) => row && row.position !== i)
        .map(({ row, i }) => ({ ...row, position: i, updated_at: now() }));
      await write("projects", rows);
    },

    // ---------- Spalten ----------

    createColumn: async (projectId, name) => {
      const cols = get().data.columns.filter((c) => c.project_id === projectId);
      await write("columns", [
        {
          id: newId(),
          project_id: projectId,
          name,
          position: Math.max(-1, ...cols.map((c) => c.position)) + 1,
          is_done: 0,
          updated_at: now(),
          deleted: 0,
        },
      ]);
    },

    deleteColumn: async (id) => {
      const taskIds = get().data.tasks.filter((t) => t.column_id === id).map((t) => t.id);
      await get().deleteTasks(taskIds);
      await softDelete("columns", (c) => c.id === id);
    },

    reorderColumns: async (ids) => {
      const rows = ids
        .map((id, i) => ({ row: find("columns", id)!, i }))
        .filter(({ row, i }) => row && row.position !== i)
        .map(({ row, i }) => ({ ...row, position: i, updated_at: now() }));
      await write("columns", rows);
    },

    // ---------- Aufgaben ----------

    createTask: async (projectId, columnId, title, extra = {}) => {
      const id = newId();
      const d = get().data;
      const siblings = d.tasks.filter((t) => t.project_id === projectId && t.column_id === columnId);
      const number = Math.max(0, ...get().raw.tasks.filter((t) => t.project_id === projectId).map((t) => t.number)) + 1;
      const task: Task = {
        id,
        project_id: projectId,
        column_id: columnId,
        number,
        title,
        description: "",
        priority: "none",
        start_date: null,
        due_date: null,
        reminder_at: null,
        recurrence: null,
        position: Math.max(-1, ...siblings.map((t) => t.position)) + 1,
        archived: 0,
        created_at: now(),
        updated_at: now(),
        deleted: 0,
        ...extra,
      };
      await write("tasks", [task]);
      await get().log(id, "created");
      return id;
    },

    startNewTask: async (req) => {
      // Doppelte Aufrufe (z. B. zweimal schnell "N") ergeben nur einen Entwurf
      if (creatingDraft) return;
      creatingDraft = true;
      setTimeout(() => (creatingDraft = false), 300);
      set({ newTaskFor: null });
      // Liegengebliebene leere Entwürfe entfernen
      const empty = get().data.tasks.filter((x) => !x.title).map((x) => x.id);
      if (empty.length) await get().deleteTasks(empty);
      const d = get().data;
      const projectId = req.projectId ?? d.projects.find((p) => !p.archived)?.id;
      if (!projectId) return;
      const cols = d.columns.filter((c) => c.project_id === projectId);
      const columnId = req.columnId === null ? null : (cols.find((c) => c.id === req.columnId)?.id ?? cols.find((c) => !c.is_done)?.id ?? null);
      const id = await get().createTask(projectId, columnId, "", { due_date: req.due ?? null });
      set({ draftTaskId: id, openTaskId: id, newTaskFor: null });
    },

    updateTask: (id, fields) => get().updateTasks([id], fields),

    updateTasks: async (ids, fields) => {
      const rows: Task[] = [];
      const finished: Task[] = [];
      for (const id of ids) {
        const old = find("tasks", id);
        if (!old) continue;
        const next: Task = { ...old, ...fields, updated_at: now() };
        // Beim Wechsel der Spalte ans Ende der neuen Spalte
        if (fields.column_id !== undefined && fields.column_id !== old.column_id && fields.position === undefined) {
          const sib = get().data.tasks.filter((t) => t.column_id === fields.column_id && t.project_id === next.project_id);
          next.position = Math.max(-1, ...sib.map((t) => t.position)) + 1;
        }
        // Beim Wechsel des Projekts: erste Spalte des neuen Projekts + neue Nummer
        if (fields.project_id && fields.project_id !== old.project_id) {
          const cols = get().data.columns.filter((c) => c.project_id === fields.project_id);
          next.column_id = next.column_id === null ? null : (cols[0]?.id ?? null);
          next.number =
            Math.max(0, ...get().raw.tasks.filter((t) => t.project_id === fields.project_id).map((t) => t.number)) + 1;
        }
        rows.push(next);

        const wasDone = !!(old.column_id && find("columns", old.column_id)?.is_done);
        const isDone = !!(next.column_id && find("columns", next.column_id)?.is_done);
        if (!wasDone && isDone) finished.push(next);
      }
      await write("tasks", rows);

      // Verlauf protokollieren
      for (const id of ids) {
        const old = rows.find((r) => r.id === id);
        if (!old) continue;
        for (const [key, value] of Object.entries(fields)) {
          if (key === "position") continue;
          if (key === "column_id") await get().log(id, "moved", { to: columnName(value as string | null) });
          else if (key === "description") await get().log(id, "description");
          else await get().log(id, "changed", { field: key, to: value });
        }
      }
      for (const t of finished) await spawnRecurrence(t);

      // Projekt gewechselt: Labels gehören zum Projekt -> gleichnamige Labels im neuen Projekt verwenden
      if (fields.project_id) {
        for (const id of ids) {
          const d = get().data;
          for (const tl of d.task_labels.filter((x) => x.task_id === id)) {
            const label = d.labels.find((l) => l.id === tl.label_id);
            if (!label || label.project_id === fields.project_id) continue;
            await get().toggleLabel(id, label.id, false);
            await get().toggleLabelByName(id, label.name, true, label.color);
          }
        }
      }
    },

    deleteTasks: async (ids) => {
      if (ids.length === 0) return;
      const set_ = new Set(ids);
      await softDelete("tasks", (t) => set_.has(t.id));
      await softDelete("subtasks", (r) => set_.has(r.task_id));
      await softDelete("task_labels", (r) => set_.has(r.task_id));
      await softDelete("comments", (r) => set_.has(r.task_id));
      await softDelete("links", (r) => set_.has(r.task_id));
      await softDelete("attachments", (r) => set_.has(r.task_id));
      await softDelete("field_values", (r) => set_.has(r.task_id));
      await softDelete("relations", (r) => set_.has(r.task_id) || set_.has(r.other_id));
      set({ selection: get().selection.filter((id) => !set_.has(id)) });
      if (get().openTaskId && set_.has(get().openTaskId!)) set({ openTaskId: null });
    },

    duplicateTask: async (id) => {
      const t = find("tasks", id);
      if (!t) return;
      const lang = get().lang;
      const copyId = await get().createTask(t.project_id, t.column_id, `${t.title} (${lang === "de" ? "Kopie" : "copy"})`, {
        description: t.description,
        priority: t.priority,
        start_date: t.start_date,
        due_date: t.due_date,
        recurrence: t.recurrence,
      });
      const d = get().data;
      for (const tl of d.task_labels.filter((x) => x.task_id === id)) await get().toggleLabel(copyId, tl.label_id, true);
      for (const s of d.subtasks.filter((x) => x.task_id === id)) await get().addSubtask(copyId, s.title);
      for (const fv of d.field_values.filter((x) => x.task_id === id)) await get().setFieldValue(copyId, fv.field_id, fv.value);
    },

    saveOrder: async (order) => {
      const pos = new Map<string, number>();
      const rows: Task[] = [];
      const moved: { id: string; to: string | null }[] = [];
      for (const { id, column_id } of order) {
        const key = column_id ?? "backlog";
        const p = pos.get(key) ?? 0;
        pos.set(key, p + 1);
        const t = find("tasks", id);
        if (!t) continue;
        if (t.column_id !== column_id) moved.push({ id, to: column_id });
        if (t.position !== p || t.column_id !== column_id) rows.push({ ...t, column_id, position: p, updated_at: now() });
      }
      // Spaltenwechsel laufen über updateTask (Verlauf + Wiederholung)
      for (const m of moved) {
        const r = rows.find((x) => x.id === m.id)!;
        await get().updateTask(m.id, { column_id: m.to, position: r.position });
      }
      await write(
        "tasks",
        rows.filter((r) => !moved.some((m) => m.id === r.id)),
      );
    },

    archiveDone: async (columnId) => {
      const ids = get().data.tasks.filter((t) => t.column_id === columnId && !t.archived).map((t) => t.id);
      await get().updateTasks(ids, { archived: 1 });
    },

    // ---------- Details ----------

    toggleLabel: async (taskId, labelId, on) => {
      const id = `${taskId}:${labelId}`;
      const existing = find("task_labels", id);
      const active = existing && !existing.deleted;
      const want = on ?? !active;
      if (want === !!active) return;
      await write("task_labels", [
        { id, task_id: taskId, label_id: labelId, updated_at: now(), deleted: want ? 0 : 1 },
      ]);
    },

    createLabel: async (projectId, name, color) => {
      const id = newId();
      await write("labels", [{ id, project_id: projectId, name, color, updated_at: now(), deleted: 0 }]);
      return id;
    },

    toggleLabelByName: async (taskId, name, on, color) => {
      const task = find("tasks", taskId);
      if (!task) return;
      const own = labelsOf(get().data, task.project_id);
      let label = own.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (!label && !on) return;
      const id = label?.id ?? (await get().createLabel(task.project_id, name, color ?? COLORS[own.length % COLORS.length]));
      await get().toggleLabel(taskId, id, on);
    },

    addSubtask: async (taskId, title, dueDate = null) => {
      const list = get().data.subtasks.filter((s) => s.task_id === taskId);
      await write("subtasks", [
        {
          id: newId(),
          task_id: taskId,
          title,
          done: 0,
          due_date: dueDate,
          position: Math.max(-1, ...list.map((s) => s.position)) + 1,
          updated_at: now(),
          deleted: 0,
        },
      ]);
    },

    reorderSubtasks: async (ids) => {
      const rows = ids
        .map((id, i) => ({ row: find("subtasks", id)!, i }))
        .filter(({ row, i }) => row && row.position !== i)
        .map(({ row, i }) => ({ ...row, position: i, updated_at: now() }));
      await write("subtasks", rows);
    },

    addComment: async (taskId, body) => {
      await write("comments", [{ id: newId(), task_id: taskId, body, created_at: now(), updated_at: now(), deleted: 0 }]);
    },

    addLink: async (taskId, url, title) => {
      await write("links", [{ id: newId(), task_id: taskId, url, title, updated_at: now(), deleted: 0 }]);
    },

    addRelation: async (taskId, otherId, kind) => {
      if (taskId === otherId) return;
      await write("relations", [{ id: newId(), task_id: taskId, other_id: otherId, kind, updated_at: now(), deleted: 0 }]);
    },

    addAttachment: async (taskId, att) => {
      await write("attachments", [
        { id: newId(), task_id: taskId, ...att, created_at: now(), updated_at: now(), deleted: 0 },
      ]);
      await get().log(taskId, "attached", { name: att.name });
    },

    createField: async (projectId, name, type, options) => {
      const list = get().data.fields.filter((f) => f.project_id === projectId);
      const field: Field = {
        id: newId(),
        project_id: projectId,
        name,
        type,
        options: JSON.stringify(options),
        position: Math.max(-1, ...list.map((f) => f.position)) + 1,
        show_on_card: 0,
        updated_at: now(),
        deleted: 0,
      };
      await write("fields", [field]);
    },

    setFieldValue: async (taskId, fieldId, value) => {
      await write("field_values", [
        { id: `${taskId}:${fieldId}`, task_id: taskId, field_id: fieldId, value, updated_at: now(), deleted: value === "" ? 1 : 0 },
      ]);
    },

    log: async (taskId, action, detail) => {
      const row = {
        id: newId(),
        task_id: taskId,
        action,
        detail: detail === undefined ? "" : JSON.stringify(detail),
        created_at: now(),
        updated_at: now(),
        deleted: 0,
      };
      await db.upsert("activity", row);
      applyRows("activity", [row]);
    },
  };
});

// ---------- Abgeleitete Werte (Selektoren) ----------

/** Labels eines Projekts */
export function labelsOf(data: Data, projectId: string | null | undefined) {
  return data.labels.filter((l) => l.project_id === projectId);
}

export function isDone(task: Task, columns: Column[]) {
  return !!task.column_id && !!columns.find((c) => c.id === task.column_id)?.is_done;
}

export function taskKey(task: Task, projects: Project[]) {
  const p = projects.find((x) => x.id === task.project_id);
  return `${p?.key || "#"}-${task.number}`;
}
