// Import und Export von Projekten und Aufgaben.
// Zwei Formate werden gelesen:
//  - JSON ("slate"-Format, enthält alles: Spalten, Labels, eigene Felder, Unteraufgaben, Links, Beziehungen …)
//  - Text/Markdown: jede Zeile eine Aufgabe, eingerückte Zeilen sind Details (siehe TEXT_EXAMPLE)
// Beim Import entstehen immer neue Zeilen mit neuen IDs – vorhandene Daten werden nie überschrieben.
import { open, save } from "@tauri-apps/plugin-dialog";
import { format } from "date-fns";
import type { Column, Data, Field, FieldType, Label, Priority, RelationKind, Task } from "./types";
import { DEFAULT_COLUMNS, isDone, taskKey, useStore } from "../store";
import { COLORS } from "./priority";
import { newId } from "./db";
import { mergeTables } from "./sync";
import { native } from "./native";
import { parseRecurrence, type Frequency, type Recurrence } from "./dates";

// ---------- Datenmodell des Imports ----------

export interface ImportTask {
  ref?: string; // Kennung für Beziehungen, z. B. "WEB-12"
  title: string;
  description: string;
  column?: string | null; // Spaltenname, null = Backlog, undefined = erste offene Spalte
  done: boolean;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  reminder_at: string | null;
  recurrence: Recurrence | null;
  labels: string[];
  subtasks: { title: string; done: boolean; due_date: string | null }[];
  links: { url: string; title: string }[];
  fields: Record<string, string>;
  relations: { kind: RelationKind; task: string }[];
  archived: boolean;
}

export interface ImportProject {
  name: string;
  key: string;
  description: string;
  columns: { name: string; done: boolean }[] | null; // null = Standardspalten
  labels: { name: string; color?: string }[];
  fields: { name: string; type: FieldType; options: string[]; show_on_card: boolean }[];
  tasks: ImportTask[];
}

export type ImportTarget = { mode: "new"; name?: string } | { mode: "existing"; projectId: string };

export const keyFromName = (name: string) =>
  name
    .replace(/[^A-Za-zÄÖÜäöü0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, _, all) => (all.length > 1 ? w[0] : w.slice(0, 3)))
    .join("")
    .slice(0, 4)
    .toUpperCase();

// ---------- Werte erkennen (Deutsch und Englisch) ----------

const PRIORITY_WORDS: Record<string, Priority> = {
  none: "none", keine: "none", no: "none",
  low: "low", niedrig: "low", gering: "low",
  medium: "medium", mittel: "medium", normal: "medium",
  high: "high", hoch: "high",
  urgent: "urgent", dringend: "urgent", kritisch: "urgent", critical: "urgent",
};
const parsePriority = (v: unknown): Priority | null => (typeof v === "string" ? (PRIORITY_WORDS[v.trim().toLowerCase()] ?? null) : null);

const FREQ_WORDS: Record<string, Frequency> = {
  daily: "daily", täglich: "daily", day: "daily",
  weekly: "weekly", wöchentlich: "weekly", week: "weekly",
  monthly: "monthly", monatlich: "monthly", month: "monthly",
  yearly: "yearly", jährlich: "yearly", year: "yearly", annually: "yearly",
};

function parseRecurrenceValue(v: unknown): Recurrence | null {
  if (!v) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const freq = FREQ_WORDS[String(o.freq ?? o.frequency ?? "").toLowerCase()];
    return freq ? { freq, interval: Math.max(1, Number(o.interval) || 1) } : null;
  }
  // "weekly", "wöchentlich", "alle 2 wochen", "every 2 weeks"
  const s = String(v).trim().toLowerCase();
  if (FREQ_WORDS[s]) return { freq: FREQ_WORDS[s], interval: 1 };
  const m = s.match(/(\d+)\s*(tag|tage|day|days|woche|wochen|week|weeks|monat|monate|month|months|jahr|jahre|year|years)/);
  if (!m) return null;
  const unit = m[2];
  const freq: Frequency = /^(tag|day)/.test(unit) ? "daily" : /^(woche|week)/.test(unit) ? "weekly" : /^(monat|month)/.test(unit) ? "monthly" : "yearly";
  return { freq, interval: Math.max(1, Number(m[1])) };
}

const pad = (n: string | number) => String(n).padStart(2, "0");

/** "2026-11-20", "20.11.2026", "20.11.26", ISO mit Uhrzeit -> "YYYY-MM-DD" */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

/** Datum mit Uhrzeit -> "YYYY-MM-DDTHH:MM" (ohne Uhrzeit: 09:00) */
export function parseDateTime(v: unknown): string | null {
  const date = parseDate(v);
  if (!date) return null;
  const time = String(v).match(/[T\s](\d{1,2}):(\d{2})/);
  return `${date}T${time ? `${pad(time[1])}:${time[2]}` : "09:00"}`;
}

const isBacklog = (name: string) => /^(backlog|rückstand)$/i.test(name.trim());
const isDoneName = (name: string) => /^(done|erledigt|fertig|abgeschlossen|completed|finished)$/i.test(name.trim());

// ---------- JSON lesen ----------

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]);

function taskFromJson(raw: unknown): ImportTask | null {
  if (typeof raw === "string") raw = { title: raw };
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = str(pick(o, "title", "name", "titel")).trim();
  if (!title) return null;
  const col = pick(o, "column", "status", "spalte");
  const doneRaw = pick(o, "done", "completed", "erledigt");
  return {
    ref: pick(o, "ref", "id", "key") !== undefined ? str(pick(o, "ref", "id", "key")) : undefined,
    title,
    description: str(pick(o, "description", "beschreibung", "notes", "body")),
    column: col === null ? null : col === undefined ? undefined : isBacklog(str(col)) ? null : str(col),
    done: doneRaw === true || doneRaw === 1 || doneRaw === "1" || doneRaw === "true",
    priority: parsePriority(pick(o, "priority", "priorität", "prio")) ?? "none",
    start_date: parseDate(pick(o, "start_date", "startDate", "start", "beginn")),
    due_date: parseDate(pick(o, "due_date", "dueDate", "due", "fällig", "faellig", "deadline")),
    reminder_at: parseDateTime(pick(o, "reminder_at", "reminderAt", "reminder", "erinnerung")),
    recurrence: parseRecurrenceValue(pick(o, "recurrence", "repeat", "wiederholung")),
    labels: asArray(pick(o, "labels", "tags"))
      .flatMap((l) => (typeof l === "string" ? l.split(",") : [str((l as Record<string, unknown>)?.name)]))
      .map((l) => l.trim())
      .filter(Boolean),
    subtasks: asArray(pick(o, "subtasks", "unteraufgaben", "checklist"))
      .map((s) => {
        if (typeof s === "string") return { title: s, done: false, due_date: null };
        const so = (s ?? {}) as Record<string, unknown>;
        return { title: str(so.title), done: !!so.done, due_date: parseDate(pick(so, "due_date", "dueDate", "due", "fällig")) };
      })
      .filter((s) => s.title.trim()),
    links: asArray(pick(o, "links", "urls"))
      .map((l) => (typeof l === "string" ? { url: l, title: "" } : { url: str((l as Record<string, unknown>)?.url), title: str((l as Record<string, unknown>)?.title) }))
      .filter((l) => l.url.trim()),
    fields: Object.fromEntries(
      Object.entries((pick(o, "fields", "felder", "custom_fields") as Record<string, unknown>) ?? {}).map(([k, v]) => [
        k,
        v === true ? "1" : v === false ? "" : str(v),
      ]),
    ),
    relations: asArray(pick(o, "relations", "beziehungen"))
      .map((r) => r as Record<string, unknown>)
      .filter((r) => r && ["blocks", "relates", "duplicates"].includes(str(r.kind ?? r.type)))
      .map((r) => ({ kind: str(r.kind ?? r.type) as RelationKind, task: str(r.task ?? r.ref ?? r.other) })),
    archived: !!pick(o, "archived", "archiviert"),
  };
}

function projectFromJson(raw: unknown): ImportProject {
  const o = (raw ?? {}) as Record<string, unknown>;
  const columns = asArray(o.columns)
    .map((c) => (typeof c === "string" ? { name: c, done: isDoneName(c) } : { name: str((c as Record<string, unknown>).name), done: !!(c as Record<string, unknown>).done || isDoneName(str((c as Record<string, unknown>).name)) }))
    .filter((c) => c.name.trim());
  return {
    name: str(pick(o, "name", "title", "titel")).trim(),
    key: str(o.key).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase(),
    description: str(pick(o, "description", "beschreibung")),
    columns: columns.length ? columns : null,
    labels: asArray(o.labels)
      .map((l) => (typeof l === "string" ? { name: l } : { name: str((l as Record<string, unknown>).name), color: str((l as Record<string, unknown>).color) || undefined }))
      .filter((l) => l.name.trim()),
    fields: asArray(o.fields)
      .map((f) => f as Record<string, unknown>)
      .filter((f) => f && str(f.name).trim())
      .map((f) => ({
        name: str(f.name).trim(),
        type: (["text", "number", "date", "select", "checkbox"].includes(str(f.type)) ? str(f.type) : "text") as FieldType,
        options: asArray(f.options).map(str),
        show_on_card: !!f.show_on_card,
      })),
    tasks: asArray(o.tasks).map(taskFromJson).filter((x): x is ImportTask => !!x),
  };
}

function parseJson(text: string): ImportProject[] {
  const json = JSON.parse(text);
  if (Array.isArray(json)) return [{ ...projectFromJson({}), tasks: json.map(taskFromJson).filter((x): x is ImportTask => !!x) }];
  if (json.app === "projekt-manager") throw new Error("backup");
  if (Array.isArray(json.projects)) {
    const list = json.projects.map(projectFromJson);
    if (Array.isArray(json.tasks)) list.push({ ...projectFromJson({}), tasks: json.tasks.map(taskFromJson).filter(Boolean) });
    return list;
  }
  return [projectFromJson(json)];
}

// ---------- Text / Markdown lesen ----------

export const TEXT_EXAMPLE = `# Website relaunch
> Neue Firmenwebsite bis Ende des Jahres

## To do
- Startseite entwerfen !hoch @2026-11-20 #Design
  Hero-Bereich mit großem Bild und kurzem Text.
  - [ ] Moodboard sammeln @15.11.2026
  - [x] Farben festlegen
  https://www.figma.com Figma-Entwurf
  Start: 10.11.2026
  Erinnerung: 19.11.2026 09:00
- Texte schreiben @01.12.2026 #Content

## In progress
- Hosting auswählen !mittel
  Wiederholung: monatlich

## Done
- [x] Domain registrieren`;

const META_KEYS: Record<string, "due" | "start" | "reminder" | "priority" | "labels" | "column" | "repeat"> = {
  due: "due", fällig: "due", faellig: "due", deadline: "due", fälligkeit: "due",
  start: "start", beginn: "start", startdatum: "start",
  reminder: "reminder", erinnerung: "reminder",
  priority: "priority", priorität: "priority", prio: "priority",
  labels: "labels", label: "labels", tags: "labels",
  status: "column", spalte: "column", column: "column",
  repeat: "repeat", wiederholung: "repeat", recurrence: "repeat",
};

const emptyTask = (title: string): ImportTask => ({
  title, description: "", column: undefined, done: false, priority: "none", start_date: null, due_date: null,
  reminder_at: null, recurrence: null, labels: [], subtasks: [], links: [], fields: {}, relations: [], archived: false,
});

/** Liest Kürzel im Titel: !hoch, @2026-11-20 (oder @start..fällig), #Label */
function parseTitle(line: string, task: ImportTask) {
  let title = line;
  title = title.replace(/(^|\s)!([\p{L}]+)/gu, (all, sp, word) => {
    const p = parsePriority(word);
    if (!p) return all;
    task.priority = p;
    return sp;
  });
  title = title.replace(/(^|\s)@(\S+?)(?:\.\.(\S+))?(?=\s|$)/g, (all, sp, a, b) => {
    const first = parseDate(a);
    if (!first) return all;
    if (b && parseDate(b)) {
      task.start_date = first;
      task.due_date = parseDate(b);
    } else task.due_date = first;
    return sp;
  });
  title = title.replace(/(^|\s)#([\p{L}][\p{L}\p{N}_\-/]*)/gu, (_all, sp, label) => {
    task.labels.push(label.replace(/_/g, " "));
    return sp;
  });
  task.title = title.replace(/\s+/g, " ").trim();
}

const LIST_MARK = /^(?:[-*+•]|\d+[.)])\s+/;
const CHECK_MARK = /^\[([ xX✓])\]\s*/;
const URL_LINE = /^(https?:\/\/\S+)\s*(.*)$/;
const MD_LINK = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/;

function parseText(text: string): ImportProject[] {
  const projects: ImportProject[] = [];
  let project: ImportProject | null = null;
  let column: string | null | undefined;
  let task: ImportTask | null = null;
  let blank = false;

  const ensureProject = () => {
    if (!project) {
      project = { ...projectFromJson({}), columns: null };
      projects.push(project);
    }
    return project;
  };
  const addColumn = (name: string) => {
    const p = ensureProject();
    if (isBacklog(name)) return null;
    p.columns ??= [];
    if (!p.columns.some((c) => c.name.toLowerCase() === name.toLowerCase())) p.columns.push({ name, done: isDoneName(name) });
    return name;
  };

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (!trimmed) {
      blank = true;
      continue;
    }
    const indented = /^\s/.test(line);

    // Überschriften: # Projekt, ## Spalte
    const h = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (h && !indented) {
      task = null;
      if (h[1].length === 1) {
        project = { ...projectFromJson({}), name: h[2].trim(), columns: null };
        projects.push(project);
        column = undefined;
      } else column = addColumn(h[2].trim());
      blank = false;
      continue;
    }
    // > Projektbeschreibung
    if (!indented && trimmed.startsWith(">") && !task) {
      const p = ensureProject();
      p.description += (p.description ? "\n" : "") + trimmed.replace(/^>\s?/, "");
      continue;
    }

    if (indented && task) {
      const body = trimmed;
      // "\" am Anfang: Zeile gehört wörtlich zur Beschreibung (z. B. Checklisten in der Beschreibung)
      if (body.startsWith("\\")) {
        task.description += (task.description ? (blank ? "\n\n" : "\n") : "") + line.replace(/^ {1,4}/, "").replace("\\", "");
        blank = false;
        continue;
      }
      const sub = body.match(LIST_MARK);
      if (sub) {
        // Eingerückter Listenpunkt = Unteraufgabe
        let t = body.slice(sub[0].length);
        const c = t.match(CHECK_MARK);
        if (c) t = t.slice(c[0].length);
        if (!URL_LINE.test(t) && !MD_LINK.test(t)) {
          let due: string | null = null;
          t = t.replace(/(^|\s)@(\S+)(?=\s|$)/, (all, sp, v) => {
            const d = parseDate(v);
            if (!d) return all;
            due = d;
            return sp;
          });
          task.subtasks.push({ title: t.trim(), done: !!c && c[1] !== " ", due_date: due });
          blank = false;
          continue;
        }
      }
      const plain = sub ? body.slice(sub[0].length) : body;
      const url = plain.match(URL_LINE);
      const md = plain.match(MD_LINK);
      if (url || md) {
        task.links.push(md ? { url: md[2], title: md[1] } : { url: url![1], title: url![2].trim() });
        blank = false;
        continue;
      }
      const meta = plain.match(/^([\p{L}]+)\s*:\s*(.+)$/u);
      const key = meta && META_KEYS[meta[1].toLowerCase()];
      if (meta && key) {
        const v = meta[2].trim();
        if (key === "due") task.due_date = parseDate(v) ?? task.due_date;
        if (key === "start") task.start_date = parseDate(v) ?? task.start_date;
        if (key === "reminder") task.reminder_at = parseDateTime(v) ?? task.reminder_at;
        if (key === "priority") task.priority = parsePriority(v) ?? task.priority;
        if (key === "labels") task.labels.push(...v.split(",").map((l) => l.trim().replace(/^#/, "")).filter(Boolean));
        if (key === "column") task.column = addColumn(v);
        if (key === "repeat") task.recurrence = parseRecurrenceValue(v) ?? task.recurrence;
        blank = false;
        continue;
      }
      // Alles andere: Beschreibung (Einrückung der ersten Ebene entfernen)
      task.description += (task.description ? (blank ? "\n\n" : "\n") : "") + line.replace(/^ {1,4}/, "");
      blank = false;
      continue;
    }

    // Neue Aufgabe
    let t = trimmed.replace(LIST_MARK, "");
    const check = t.match(CHECK_MARK);
    if (check) t = t.slice(check[0].length);
    task = emptyTask("");
    parseTitle(t, task);
    task.done = !!check && check[1] !== " ";
    task.column = column;
    if (task.title) ensureProject().tasks.push(task);
    else task = null;
    blank = false;
  }
  return projects;
}

// ---------- Erkennen ----------

export type ParseResult = { projects: ImportProject[]; error?: string };

export function parseImport(text: string): ParseResult {
  const s = text.trim();
  if (!s) return { projects: [] };
  try {
    const projects = s.startsWith("{") || s.startsWith("[") ? parseJson(s) : parseText(s);
    return { projects: projects.filter((p) => p.tasks.length || p.name) };
  } catch (e) {
    return { projects: [], error: (e as Error).message === "backup" ? "backup" : String((e as Error).message ?? e) };
  }
}

export function importStats(projects: ImportProject[]) {
  const tasks = projects.flatMap((p) => p.tasks);
  return { projects: projects.length, tasks: tasks.length, subtasks: tasks.reduce((n, x) => n + x.subtasks.length, 0) };
}

// ---------- Anlegen ----------

/** Legt die importierten Projekte/Aufgaben an. Gibt die ID des (ersten) Zielprojekts und die Anzahl Aufgaben zurück. */
export async function runImport(projects: ImportProject[], target: ImportTarget) {
  const store = useStore.getState();
  const { data, raw, lang } = store;
  const ts = Date.now();
  const rows: { [K in keyof Data]?: Data[K] } = {};
  const push = <K extends keyof Data>(table: K, row: Data[K][number]) => {
    ((rows[table] ??= []) as Data[K][number][]).push(row);
  };
  const base = { updated_at: ts, deleted: 0 };

  // Labels gehören zum Projekt: vorhandene im Zielprojekt per Name wiederverwenden
  const labels = new Map(data.labels.map((l) => [`${l.project_id}|${l.name.toLowerCase()}`, l.id]));
  const labelColors = new Map(projects.flatMap((p) => p.labels).map((l) => [l.name.toLowerCase(), l.color]));
  const labelId = (projectId: string, name: string) => {
    const k = `${projectId}|${name.toLowerCase()}`;
    let id = labels.get(k);
    if (!id) {
      id = newId();
      const color = labelColors.get(name.toLowerCase()) || COLORS[labels.size % COLORS.length];
      push("labels", { id, project_id: projectId, name, color, ...base } as Label);
      labels.set(k, id);
    }
    return id;
  };

  let firstProjectId = "";
  let taskCount = 0;
  let projectPos = Math.max(0, ...data.projects.map((p) => p.position));
  const refs = new Map<string, string>(); // ref/Titel -> neue Aufgaben-ID
  const pendingRelations: { taskId: string; kind: RelationKind; ref: string }[] = [];

  for (const [pi, p] of projects.entries()) {
    // Zielprojekt bestimmen
    let projectId: string;
    let columns: Column[];
    let fields: Field[];
    if (target.mode === "existing") {
      projectId = target.projectId;
      columns = data.columns.filter((c) => c.project_id === projectId).sort((a, b) => a.position - b.position);
      fields = data.fields.filter((f) => f.project_id === projectId);
    } else {
      projectId = newId();
      const name = (pi === 0 && target.name?.trim()) || p.name || (lang === "de" ? "Importiertes Projekt" : "Imported project");
      // Kürzel aus der Datei nur übernehmen, wenn es noch frei ist
      const usedKeys = new Set([...data.projects.map((x) => x.key), ...(rows.projects ?? []).map((x) => x.key)]);
      let key = p.key && !usedKeys.has(p.key) ? p.key : keyFromName(name);
      for (let n = 2; usedKeys.has(key); n++) key = `${keyFromName(name).slice(0, 3)}${n}`;
      push("projects", {
        id: projectId, name, key, description: p.description, icon: "", color: COLORS[0],
        position: ++projectPos, archived: 0, favorite: 0, ...base,
      });
      const defs = p.columns ?? DEFAULT_COLUMNS.map((c) => ({ name: c[lang], done: c.done }));
      // Erledigte Aufgaben brauchen eine erledigt-Spalte
      if (p.tasks.some((x) => x.done && x.column === undefined) && !defs.some((c) => c.done))
        defs.push({ name: lang === "de" ? "Erledigt" : "Done", done: true });
      columns = defs.map((c, i) => ({ id: newId(), project_id: projectId, name: c.name, position: i, is_done: c.done ? 1 : 0, ...base }));
      columns.forEach((c) => push("columns", c));
      fields = [];
    }
    firstProjectId ||= projectId;

    const findColumn = (name: string) => {
      let col = columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!col) {
        col = { id: newId(), project_id: projectId, name, position: columns.length, is_done: isDoneName(name) ? 1 : 0, ...base };
        columns.push(col);
        push("columns", col);
      }
      return col;
    };
    const fieldFor = (name: string) => {
      let f = fields.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!f) {
        const def = p.fields.find((x) => x.name.toLowerCase() === name.toLowerCase());
        f = {
          id: newId(), project_id: projectId, name, type: def?.type ?? "text", options: JSON.stringify(def?.options ?? []),
          position: fields.length, show_on_card: def?.show_on_card ? 1 : 0, ...base,
        };
        fields.push(f);
        push("fields", f);
      }
      return f;
    };
    // Felder aus der Projektdefinition auch ohne Werte anlegen
    p.fields.forEach((f) => fieldFor(f.name));
    p.labels.forEach((l) => labelId(projectId, l.name));

    let number = Math.max(0, ...raw.tasks.filter((x) => x.project_id === projectId).map((x) => x.number));
    const positions = new Map<string, number>();
    const nextPos = (colId: string | null) => {
      const k = colId ?? "backlog";
      if (!positions.has(k)) positions.set(k, Math.max(-1, ...data.tasks.filter((x) => x.project_id === projectId && x.column_id === colId).map((x) => x.position)));
      positions.set(k, positions.get(k)! + 1);
      return positions.get(k)!;
    };

    for (const x of p.tasks) {
      let column: Column | null;
      if (x.column === null) column = null;
      else if (x.column) column = findColumn(x.column);
      else column = (x.done ? columns.find((c) => c.is_done) : columns.find((c) => !c.is_done)) ?? columns[0] ?? findColumn(lang === "de" ? "Zu erledigen" : "To do");

      const id = newId();
      const task: Task = {
        id, project_id: projectId, column_id: column?.id ?? null, number: ++number, title: x.title, description: x.description,
        priority: x.priority, start_date: x.start_date, due_date: x.due_date, reminder_at: x.reminder_at,
        recurrence: x.recurrence ? JSON.stringify(x.recurrence) : null, position: nextPos(column?.id ?? null),
        archived: x.archived ? 1 : 0, created_at: ts, ...base,
      };
      push("tasks", task);
      push("activity", { id: newId(), task_id: id, action: "created", detail: "", created_at: ts, ...base });
      taskCount++;
      if (x.ref) refs.set(x.ref.toLowerCase(), id);
      if (!refs.has(x.title.toLowerCase())) refs.set(x.title.toLowerCase(), id);

      for (const name of new Set(x.labels)) {
        const lid = labelId(projectId, name);
        push("task_labels", { id: `${id}:${lid}`, task_id: id, label_id: lid, ...base });
      }
      x.subtasks.forEach((s, i) => push("subtasks", { id: newId(), task_id: id, title: s.title.trim(), done: s.done ? 1 : 0, due_date: s.due_date, position: i, ...base }));
      x.links.forEach((l) => push("links", { id: newId(), task_id: id, url: l.url.trim(), title: l.title.trim(), ...base }));
      for (const [name, value] of Object.entries(x.fields)) {
        if (value === "") continue;
        const f = fieldFor(name);
        const v = f.type === "date" ? (parseDate(value) ?? value) : f.type === "checkbox" ? (value && value !== "0" ? "1" : "") : value;
        if (v) push("field_values", { id: `${id}:${f.id}`, task_id: id, field_id: f.id, value: v, ...base });
      }
      x.relations.forEach((r) => pendingRelations.push({ taskId: id, kind: r.kind, ref: r.task }));
    }
  }

  for (const r of pendingRelations) {
    const other = refs.get(r.ref.toLowerCase());
    if (other && other !== r.taskId) push("relations", { id: newId(), task_id: r.taskId, other_id: other, kind: r.kind, ...base });
  }

  await mergeTables(rows);
  await useStore.getState().reload();
  useStore.getState().onChange();
  return { projectId: firstProjectId, tasks: taskCount };
}

/** Datei auswählen und als Text lesen */
export async function pickImportFile() {
  const path = await open({ multiple: false, filters: [{ name: "Slate / Text", extensions: ["json", "md", "txt"] }] });
  if (!path || Array.isArray(path)) return null;
  return { name: path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, ""), text: await native.readTextFile(path) };
}

// ---------- Export eines Projekts ----------

/** Ein Projekt mit allem, was dazugehört, im Import-Format (ohne Dateianhänge). */
export function buildProjectExport(projectId: string, d: Data = useStore.getState().data) {
  const p = d.projects.find((x) => x.id === projectId);
  if (!p) throw new Error("project not found");
  const columns = d.columns.filter((c) => c.project_id === projectId).sort((a, b) => a.position - b.position);
  const fields = d.fields.filter((f) => f.project_id === projectId).sort((a, b) => a.position - b.position);
  const tasks = d.tasks
    .filter((x) => x.project_id === projectId && x.title)
    .sort((a, b) => (columns.findIndex((c) => c.id === a.column_id) - columns.findIndex((c) => c.id === b.column_id)) || a.position - b.position);
  const labelIds = new Set(d.task_labels.filter((l) => tasks.some((x) => x.id === l.task_id)).map((l) => l.label_id));
  const ref = (id: string) => {
    const x = d.tasks.find((t) => t.id === id);
    return x && x.project_id === projectId ? taskKey(x, d.projects) : null;
  };
  const project = {
    name: p.name,
    key: p.key,
    description: p.description,
    columns: columns.map((c) => ({ name: c.name, done: !!c.is_done })),
    labels: d.labels.filter((l) => labelIds.has(l.id)).map((l) => ({ name: l.name, color: l.color })),
    fields: fields.map((f) => ({ name: f.name, type: f.type, options: JSON.parse(f.options || "[]"), show_on_card: !!f.show_on_card })),
    tasks: tasks.map((x) => ({
      ref: taskKey(x, d.projects),
      title: x.title,
      description: x.description || undefined,
      column: columns.find((c) => c.id === x.column_id)?.name ?? null,
      done: isDone(x, d.columns) || undefined,
      priority: x.priority !== "none" ? x.priority : undefined,
      start_date: x.start_date ?? undefined,
      due_date: x.due_date ?? undefined,
      reminder_at: x.reminder_at ?? undefined,
      recurrence: parseRecurrence(x.recurrence) ?? undefined,
      labels: d.task_labels.filter((l) => l.task_id === x.id).map((l) => d.labels.find((lb) => lb.id === l.label_id)?.name).filter(Boolean),
      subtasks: d.subtasks.filter((s) => s.task_id === x.id).sort((a, b) => a.position - b.position).map((s) => ({ title: s.title, done: !!s.done, ...(s.due_date ? { due_date: s.due_date } : {}) })),
      links: d.links.filter((l) => l.task_id === x.id).map((l) => ({ url: l.url, title: l.title })),
      fields: Object.fromEntries(
        d.field_values
          .filter((v) => v.task_id === x.id)
          .map((v) => [fields.find((f) => f.id === v.field_id)?.name, v.value])
          .filter(([k]) => k),
      ),
      relations: d.relations
        .filter((r) => r.task_id === x.id)
        .map((r) => ({ kind: r.kind, task: ref(r.other_id) }))
        .filter((r) => r.task),
      archived: x.archived ? true : undefined,
    })),
  };
  // Leere Listen weglassen, damit die Datei gut lesbar bleibt
  for (const x of project.tasks as Record<string, unknown>[])
    for (const k of Object.keys(x)) if (Array.isArray(x[k]) && !(x[k] as unknown[]).length) delete x[k];
  for (const x of project.tasks as Record<string, unknown>[]) if (x.fields && !Object.keys(x.fields as object).length) delete x.fields;
  return { format: "slate", version: 1, exportedAt: new Date().toISOString(), projects: [project] };
}

export async function exportProject(projectId: string) {
  const json = buildProjectExport(projectId);
  const name = json.projects[0].name.replace(/[\\/:*?"<>|]/g, "").trim() || "projekt";
  const path = await save({ defaultPath: `${name}-${format(new Date(), "yyyy-MM-dd")}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path) return null;
  await native.writeTextFile(path, JSON.stringify(json, null, 2));
  return path;
}

export const JSON_EXAMPLE = JSON.stringify(
  {
    format: "slate",
    version: 1,
    projects: [
      {
        name: "Website relaunch",
        key: "WEB",
        description: "New company website",
        columns: [{ name: "To do" }, { name: "In progress" }, { name: "Done", done: true }],
        fields: [{ name: "Customer", type: "text" }],
        tasks: [
          {
            ref: "WEB-1",
            title: "Design the homepage",
            description: "Hero section with a large image.\n\n- [ ] Mobile version",
            column: "To do",
            priority: "high",
            start_date: "2026-11-10",
            due_date: "2026-11-20",
            reminder_at: "2026-11-19T09:00",
            recurrence: null,
            labels: ["Design"],
            subtasks: [{ title: "Collect a moodboard", done: false, due_date: "2026-11-15" }],
            links: [{ url: "https://www.figma.com", title: "Figma draft" }],
            fields: { Customer: "ACME" },
          },
          { ref: "WEB-2", title: "Write the texts", due_date: "2026-12-01", relations: [{ kind: "blocks", task: "WEB-1" }] },
        ],
      },
    ],
  },
  null,
  2,
);
