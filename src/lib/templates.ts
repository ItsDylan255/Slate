// Projektvorlagen: Spalten, Labels, eigene Felder und Start-Aufgaben.
// Eine Vorlage speichert ein ImportProject (gleiches Format wie der Import), ein neues Projekt
// aus einer Vorlage entsteht also über runImport.
import type { Template } from "./types";
import { newId } from "./db";
import { useStore } from "../store";
import { buildProjectExport, parseImport, runImport, type ImportProject, type ImportTask } from "./importer";

export const emptyTemplate = (): ImportProject => ({
  name: "",
  key: "",
  description: "",
  columns: null,
  labels: [],
  fields: [],
  tasks: [],
});

export function readTemplate(t: Template): ImportProject {
  try {
    return { ...emptyTemplate(), ...(JSON.parse(t.data) as Partial<ImportProject>) };
  } catch {
    return emptyTemplate();
  }
}

const PRIO_WORD = { none: "", low: "!low", medium: "!medium", high: "!high", urgent: "!urgent" } as const;

/** Aufgaben im Textformat des Imports (zum Bearbeiten in der Vorlage). */
export function tasksToText(tasks: ImportTask[]): string {
  const lines: string[] = [];
  let column: string | null | undefined = undefined;
  // Nach Spalte gruppieren, Reihenfolge der ersten Vorkommen behalten
  const order: (string | null | undefined)[] = [];
  for (const x of tasks) if (!order.includes(x.column)) order.push(x.column);
  for (const col of order) {
    for (const x of tasks.filter((t) => t.column === col)) {
      if (col !== column) {
        if (lines.length) lines.push("");
        if (col !== undefined) lines.push(`## ${col ?? "Backlog"}`);
        column = col;
      }
      const tokens = [PRIO_WORD[x.priority], ...x.labels.map((l) => `#${l.replace(/\s+/g, "_")}`)].filter(Boolean);
      lines.push(`- ${x.done ? "[x] " : ""}${x.title}${tokens.length ? " " + tokens.join(" ") : ""}`);
      // Beschreibungszeilen, die sonst als Unteraufgabe, Link oder Eigenschaft gelesen würden, mit "\" schützen
      const special = /^\s*((?:[-*+•]|\d+[.)])\s|https?:\/\/|\[[^\]]+\]\(|[\p{L}]+\s*:\s*\S)/u;
      if (x.description) for (const l of x.description.split("\n")) lines.push(l.trim() ? `  ${special.test(l) ? "\\" : ""}${l}` : "");
      for (const s of x.subtasks) lines.push(`  - [${s.done ? "x" : " "}] ${s.title}`);
      for (const l of x.links) lines.push(`  ${l.url}${l.title ? " " + l.title : ""}`);
      if (x.recurrence) lines.push(`  Repeat: ${x.recurrence.interval > 1 ? `${x.recurrence.interval} ` : ""}${x.recurrence.freq}`);
    }
  }
  return lines.join("\n");
}

/** Aufgaben aus dem Text der Vorlage lesen */
export function textToTasks(text: string): ImportTask[] {
  return parseImport(text).projects.flatMap((p) => p.tasks);
}

/** Vorlage aus einem bestehenden Projekt: ohne Daten, alles wieder offen. */
export function templateFromProject(projectId: string, withTasks: boolean): ImportProject {
  const exported = buildProjectExport(projectId);
  const p = parseImport(JSON.stringify(exported)).projects[0];
  const firstOpen = p.columns?.find((c) => !c.done)?.name;
  return {
    ...p,
    key: "",
    tasks: withTasks
      ? p.tasks
          .filter((x) => !x.archived)
          .map((x) => ({
            ...x,
            ref: undefined,
            relations: [],
            done: false,
            column: x.done ? firstOpen : x.column,
            start_date: null,
            due_date: null,
            reminder_at: null,
            subtasks: x.subtasks.map((s) => ({ ...s, done: false, due_date: null })),
          }))
      : [],
  };
}

export async function saveTemplate(id: string | null, name: string, data: ImportProject) {
  const { save, data: d } = useStore.getState();
  const old = d.templates.find((t) => t.id === id);
  await save("templates", {
    id: old?.id ?? newId(),
    name,
    data: JSON.stringify({ ...data, name: "" }),
    position: old?.position ?? Math.max(-1, ...d.templates.map((t) => t.position)) + 1,
    updated_at: Date.now(),
    deleted: 0,
  });
}

/** Neues Projekt aus einer Vorlage. Gibt die Projekt-ID zurück. */
export async function createFromTemplate(templateId: string, values: { name: string; key: string; description: string }) {
  const tpl = useStore.getState().data.templates.find((t) => t.id === templateId);
  if (!tpl) throw new Error("template not found");
  const p = readTemplate(tpl);
  const res = await runImport([{ ...p, name: values.name, key: values.key, description: values.description || p.description }], { mode: "new" });
  return res.projectId;
}
