// Datentypen = Tabellen in der Datenbank (siehe src-tauri/migrations).
// Jede Zeile hat id, updated_at (ms) und deleted – das braucht der Google-Drive-Sync.

export interface Row {
  id: string;
  updated_at: number;
  deleted: number;
}

export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export interface Project extends Row {
  name: string;
  key: string; // Kürzel für Aufgabennummern, z. B. "WEB" -> WEB-12
  description: string;
  icon: string; // Emoji
  color: string;
  position: number;
  archived: number;
  favorite: number; // 1 = oben in der Seitenleiste unter "Favoriten"
}

export interface Column extends Row {
  project_id: string;
  name: string;
  position: number;
  is_done: number; // 1 = Aufgaben hier gelten als erledigt
}

export interface Task extends Row {
  project_id: string;
  column_id: string | null; // null = Backlog
  number: number;
  title: string;
  description: string;
  priority: Priority;
  start_date: string | null; // "YYYY-MM-DD"
  due_date: string | null; // "YYYY-MM-DD"
  reminder_at: string | null; // "YYYY-MM-DDTHH:MM"
  recurrence: string | null; // JSON: Recurrence
  position: number;
  archived: number;
  created_at: number;
}

export interface Label extends Row {
  project_id: string | null; // Labels gehören zu einem Projekt
  name: string;
  color: string;
}

export interface TaskLabel extends Row {
  task_id: string;
  label_id: string;
}

export interface Subtask extends Row {
  task_id: string;
  title: string;
  done: number;
  position: number;
  due_date: string | null; // "YYYY-MM-DD"
}

export interface Attachment extends Row {
  task_id: string;
  name: string;
  file: string;
  size: number;
  created_at: number;
}

export type RelationKind = "blocks" | "relates" | "duplicates";

export interface Relation extends Row {
  task_id: string;
  other_id: string;
  kind: RelationKind;
}

export interface Comment extends Row {
  task_id: string;
  body: string;
  created_at: number;
}

export interface Activity extends Row {
  task_id: string;
  action: string;
  detail: string;
  created_at: number;
}

export interface Link extends Row {
  task_id: string;
  url: string;
  title: string;
}

export type FieldType = "text" | "number" | "date" | "select" | "checkbox";

export interface Field extends Row {
  project_id: string;
  name: string;
  type: FieldType;
  options: string; // JSON-Array mit Auswahlmöglichkeiten (nur "select")
  position: number;
  show_on_card: number;
}

export interface FieldValue extends Row {
  task_id: string;
  field_id: string;
  value: string;
}

/** Projektvorlage. data = ImportProject als JSON (siehe lib/importer.ts) */
export interface Template extends Row {
  name: string;
  data: string;
  position: number;
}

/** Alle synchronisierten Tabellen und ihr Zeilentyp. */
export interface Tables {
  projects: Project;
  columns: Column;
  tasks: Task;
  labels: Label;
  task_labels: TaskLabel;
  subtasks: Subtask;
  attachments: Attachment;
  relations: Relation;
  comments: Comment;
  activity: Activity;
  links: Link;
  fields: Field;
  field_values: FieldValue;
  templates: Template;
}

export type TableName = keyof Tables;

export const TABLES: TableName[] = [
  "projects",
  "columns",
  "tasks",
  "labels",
  "task_labels",
  "subtasks",
  "attachments",
  "relations",
  "comments",
  "activity",
  "links",
  "fields",
  "field_values",
  "templates",
];

export type Data = { [K in TableName]: Tables[K][] };
