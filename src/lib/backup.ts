// Automatische Backups mit fester Anzahl Dateien (keine endlos wachsende Sammlung):
// Es gibt genau vier "Fächer". Jedes wird überschrieben, sobald es älter als sein Abstand ist.
//   täglich  -> Stand von höchstens 1 Tag
//   3 Tage   -> Stand von höchstens 3 Tagen
//   Woche    -> Stand von höchstens 7 Tagen
//   Monat    -> Stand von höchstens 30 Tagen
// Ablage: %APPDATA%\com.dylan.projektmanager\backups\backup-<fach>.json
import * as db from "./db";
import { joinPath, native } from "./native";
import { useStore } from "../store";
import type { Data, Row, TableName } from "./types";
import { TABLES } from "./types";

const DAY = 86_400_000;

export const BACKUP_SLOTS = [
  { key: "daily", maxAge: DAY },
  { key: "3days", maxAge: 3 * DAY },
  { key: "weekly", maxAge: 7 * DAY },
  { key: "monthly", maxAge: 30 * DAY },
] as const;

export type SlotKey = (typeof BACKUP_SLOTS)[number]["key"];

export async function backupDir() {
  return joinPath(await native.appDataPath(), "backups");
}

const slotPath = async (key: SlotKey) => joinPath(await backupDir(), `backup-${key}.json`);

/** Zeitpunkt des letzten Backups je Fach (ms) oder null. */
export async function backupTimes(): Promise<Record<SlotKey, number | null>> {
  const out = {} as Record<SlotKey, number | null>;
  for (const s of BACKUP_SLOTS) {
    const v = await db.getSetting(`backup_${s.key}`);
    out[s.key] = v ? Number(v) : null;
  }
  return out;
}

/** Inhalt eines Backups zum Ansehen (alte Version) */
export async function readBackup(key: SlotKey) {
  const json = JSON.parse(await native.readTextFile(await slotPath(key))) as { exportedAt: number; tables: Partial<Data> };
  return { at: json.exportedAt, tables: json.tables };
}

/** Beliebige Sicherungsdatei (automatisch oder manuell exportiert) zum Ansehen öffnen */
export async function pickBackupFile() {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, defaultPath: await backupDir(), filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path || Array.isArray(path)) return null;
  const json = JSON.parse(await native.readTextFile(path));
  if (json.app !== "projekt-manager" || !json.tables) throw new Error("backup.invalid");
  return { at: Number(json.exportedAt) || Date.now(), tables: json.tables as Partial<Data> };
}

/** Schreibt alle Fächer neu, deren Stand zu alt ist. */
export async function runBackups() {
  const raw = useStore.getState().raw;
  if (raw.tasks.length === 0 && raw.projects.length === 0) return; // nichts zu sichern
  const now = Date.now();
  const times = await backupTimes();
  for (const s of BACKUP_SLOTS) {
    const last = times[s.key];
    if (last && now - last < s.maxAge) continue;
    const content = JSON.stringify({ app: "projekt-manager", version: 1, exportedAt: now, tables: raw });
    await native.writeTextFile(await slotPath(s.key), content);
    await db.setSetting(`backup_${s.key}`, String(now));
  }
}

/**
 * Stellt ein Backup wieder her: Alle Einträge aus dem Backup werden mit "jetzt" als Änderungszeit
 * gespeichert. So kommen auch gelöschte Aufgaben zurück und der Stand wird auf andere PCs übertragen.
 */
export async function restoreBackup(key: SlotKey) {
  const json = JSON.parse(await native.readTextFile(await slotPath(key))) as { tables: Partial<Data> };
  const now = Date.now();
  let n = 0;
  for (const table of TABLES) {
    const rows = (json.tables[table] ?? []) as Row[];
    for (const row of rows) {
      await db.upsert(table as TableName, { ...row, updated_at: now } as never);
      n++;
    }
  }
  await useStore.getState().reload();
  useStore.getState().onChange();
  return n;
}

/** Stellt das neueste vorhandene Backup wieder her (nach einer Reparatur). */
export async function restoreNewestBackup() {
  let best: { key: SlotKey; at: number } | null = null;
  for (const s of BACKUP_SLOTS) {
    const path = await slotPath(s.key);
    if (!(await native.fileExists(path))) continue;
    try {
      const at = (JSON.parse(await native.readTextFile(path)) as { exportedAt: number }).exportedAt;
      if (!best || at > best.at) best = { key: s.key, at };
    } catch {
      /* unlesbar – überspringen */
    }
  }
  if (best) await restoreBackup(best.key);
}

/** Backups beim Start und danach stündlich prüfen. */
export function startBackups() {
  const tick = () => runBackups().catch((e) => console.error("Backup fehlgeschlagen", e));
  setTimeout(tick, 10_000);
  setInterval(tick, 60 * 60_000);
}
