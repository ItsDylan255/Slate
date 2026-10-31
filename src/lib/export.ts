// Backup (JSON), Tabellen-Export (CSV) und Kalender-Export (iCal / .ics)
import { open, save } from "@tauri-apps/plugin-dialog";
import { addDays, format, parseISO } from "date-fns";
import { native } from "./native";
import { mergeTables } from "./sync";
import { isDone, taskKey, useStore } from "../store";
import { priorityInfo } from "./priority";
import { translate } from "../i18n";

const stamp = () => format(new Date(), "yyyy-MM-dd");

/** Speichert alle Daten als JSON-Datei. Gibt den Pfad zurück oder null bei Abbruch. */
export async function exportBackup() {
  const path = await save({
    defaultPath: `slate-backup-${stamp()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;
  const raw = useStore.getState().raw;
  await native.writeTextFile(path, JSON.stringify({ app: "projekt-manager", version: 1, exportedAt: Date.now(), tables: raw }, null, 1));
  return path;
}

/** Liest ein Backup ein und führt es mit den vorhandenen Daten zusammen (neuere Änderung gewinnt). */
export async function importBackup() {
  const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path || Array.isArray(path)) return null;
  const json = JSON.parse(await native.readTextFile(path));
  if (json.app !== "projekt-manager" || !json.tables) throw new Error(translate(useStore.getState().lang, "backup.invalid"));
  const n = await mergeTables(json.tables);
  await useStore.getState().reload();
  useStore.getState().onChange();
  return n;
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Exportiert alle Aufgaben als CSV (Semikolon getrennt – öffnet sich direkt in Excel). */
export async function exportCsv() {
  const { data: d, lang } = useStore.getState();
  const path = await save({ defaultPath: `aufgaben-${stamp()}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] });
  if (!path) return null;
  const tr = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const header = [
    tr("list.number"),
    tr("list.title"),
    tr("task.project"),
    tr("task.status"),
    tr("task.priority"),
    tr("task.labels"),
    tr("task.startDate"),
    tr("task.dueDate"),
    tr("csv.done"),
    tr("nav.archive"),
    tr("task.description"),
  ];
  const rows = d.tasks.map((x) => [
    taskKey(x, d.projects),
    x.title,
    d.projects.find((p) => p.id === x.project_id)?.name,
    d.columns.find((c) => c.id === x.column_id)?.name ?? tr("view.backlog"),
    tr(priorityInfo(x.priority).label),
    d.task_labels
      .filter((l) => l.task_id === x.id)
      .map((l) => d.labels.find((lb) => lb.id === l.label_id)?.name)
      .filter(Boolean)
      .join(", "),
    x.start_date,
    x.due_date,
    isDone(x, d.columns) ? "1" : "0",
    x.archived ? "1" : "0",
    x.description,
  ]);
  // BOM, damit Excel Umlaute richtig anzeigt
  const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  await native.writeTextFile(path, csv);
  return path;
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);
const icsDate = (iso: string) => iso.replace(/-/g, "");

/** Erstellt eine .ics-Datei mit allen Aufgaben, die ein Datum haben (für Outlook, Google Kalender …). */
export function buildIcs() {
  const { data: d } = useStore.getState();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Slate//DE", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Slate"];
  const now = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
  for (const x of d.tasks) {
    if (x.archived || (!x.due_date && !x.start_date)) continue;
    const start = x.start_date ?? x.due_date!;
    const end = x.due_date ?? x.start_date!;
    const project = d.projects.find((p) => p.id === x.project_id);
    if (project?.archived) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${x.id}@projekt-manager`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(format(addDays(parseISO(end), 1), "yyyy-MM-dd"))}`,
      `SUMMARY:${icsEscape(`${isDone(x, d.columns) ? "✓ " : ""}[${taskKey(x, d.projects)}] ${x.title}`)}`,
      `DESCRIPTION:${icsEscape(x.description.slice(0, 1000))}`,
      `CATEGORIES:${icsEscape(project?.name ?? "")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export async function exportIcs() {
  const path = await save({ defaultPath: `slate-${stamp()}.ics`, filters: [{ name: "iCalendar", extensions: ["ics"] }] });
  if (!path) return null;
  await native.writeTextFile(path, buildIcs());
  return path;
}
