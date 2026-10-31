// Einfache, allgemeine Datenbankfunktionen. Die eigentliche App-Logik steht in src/store.ts.
import Database from "@tauri-apps/plugin-sql";
import type { Data, TableName, Tables } from "./types";
import { TABLES } from "./types";

let dbPromise: Promise<Database> | null = null;

function db(): Promise<Database> {
  dbPromise ??= Database.load("sqlite:projekt-manager.db");
  return dbPromise;
}

export const newId = () => crypto.randomUUID();

/** Lädt alle Tabellen komplett (inkl. gelöschter Zeilen, die braucht der Sync). */
export async function loadAll(): Promise<Data> {
  const d = await db();
  const entries = await Promise.all(
    TABLES.map(async (t) => [t, await d.select<unknown[]>(`SELECT * FROM ${t}`)] as const),
  );
  return Object.fromEntries(entries) as unknown as Data;
}

/** Schreibt eine komplette Zeile (neu oder überschreiben). */
export async function upsert<T extends TableName>(table: T, row: Tables[T]) {
  const keys = Object.keys(row);
  const values = keys.map((k) => (row as unknown as Record<string, unknown>)[k]);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  await (await db()).execute(
    `INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`,
    values,
  );
}

export async function upsertMany<T extends TableName>(table: T, rows: Tables[T][]) {
  for (const row of rows) await upsert(table, row);
}

// ---------- Lokale Einstellungen (nicht synchronisiert) ----------

export async function getSetting(key: string): Promise<string | null> {
  const rows = await (await db()).select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await (await db()).execute("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)", [
    key,
    value,
  ]);
}
