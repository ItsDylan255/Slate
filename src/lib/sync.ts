// Synchronisation über einen Ordner in Google Drive (Google Drive für Desktop).
//
// Jeder PC schreibt nur seine EIGENE Datei:  <Sync-Ordner>\devices\<Geräte-ID>.json
// und liest die Dateien der anderen PCs. Pro Zeile gewinnt die neuere Änderung (updated_at).
// Gelöschte Zeilen bleiben als "deleted = 1" erhalten, damit Löschungen auch übertragen werden.
// So entstehen nie Schreibkonflikte in Google Drive. Anhänge liegen in <Sync-Ordner>\attachments.
import * as db from "./db";
import { joinPath, native } from "./native";
import { attachmentsDir } from "./files";
import type { Data, Row, TableName } from "./types";
import { TABLES } from "./types";
import { useStore } from "../store";

export const SYNC_FOLDER_NAME = "Slate";

interface SyncFile {
  app: "projekt-manager";
  version: 1;
  device: string;
  deviceName: string;
  writtenAt: number;
  tables: Partial<Data>;
}

let deviceId = "";
let running = false;
let again = false;
let dirty = true;
let timer: ReturnType<typeof setTimeout> | undefined;

export async function getSyncConfig() {
  return {
    enabled: (await db.getSetting("sync_enabled")) === "1",
    dir: (await db.getSetting("sync_dir")) ?? "",
  };
}

export async function setSyncConfig(enabled: boolean, dir: string) {
  await db.setSetting("sync_enabled", enabled ? "1" : "0");
  await db.setSetting("sync_dir", dir);
  useStore.getState().set({ syncStatus: { state: enabled ? "idle" : "off" } });
  dirty = true;
  if (enabled) await syncNow();
}

export async function suggestSyncDir() {
  const drive = await native.findGoogleDrive();
  return drive ? joinPath(drive, SYNC_FOLDER_NAME) : "";
}

async function getDeviceId() {
  if (deviceId) return deviceId;
  deviceId = (await db.getSetting("device_id")) ?? "";
  if (!deviceId) {
    deviceId = db.newId();
    await db.setSetting("device_id", deviceId);
  }
  return deviceId;
}

/** Führt fremde Zeilen in die lokale Datenbank ein. Gibt die Anzahl geänderter Zeilen zurück. */
export async function mergeTables(remote: Partial<Data>): Promise<number> {
  const local = useStore.getState().raw;
  let changed = 0;
  for (const table of TABLES) {
    const rows = remote[table] as Row[] | undefined;
    if (!Array.isArray(rows)) continue;
    const byId = new Map((local[table] as Row[]).map((r) => [r.id, r]));
    for (const row of rows) {
      if (!row || typeof row.id !== "string") continue;
      const mine = byId.get(row.id);
      if (!mine || row.updated_at > mine.updated_at) {
        await db.upsert(table as TableName, row as never);
        byId.set(row.id, row);
        changed++;
      }
    }
  }
  return changed;
}

/** Synchronisiert jetzt (lesen, zusammenführen, eigene Datei schreiben, Anhänge abgleichen). */
export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  const { enabled, dir } = await getSyncConfig();
  const store = useStore.getState();
  if (!enabled || !dir) {
    store.set({ syncStatus: { state: "off" } });
    return;
  }

  running = true;
  store.set({ syncStatus: { ...store.syncStatus, state: "syncing" } });
  try {
    const me = await getDeviceId();
    const devicesDir = joinPath(dir, "devices");

    // 1. Dateien der anderen PCs einlesen und zusammenführen
    let changed = 0;
    for (const [name, content] of await native.readJsonFiles(devicesDir)) {
      if (name === `${me}.json`) continue;
      try {
        const file = JSON.parse(content) as SyncFile;
        if (file.app !== "projekt-manager") continue;
        changed += await mergeTables(file.tables);
      } catch {
        // Datei wird gerade von Google Drive geschrieben – beim nächsten Mal
      }
    }
    if (changed > 0) await useStore.getState().reload();

    // 2. Eigene Datei schreiben (nur wenn sich etwas geändert hat)
    if (dirty || changed > 0) {
      dirty = false;
      const file: SyncFile = {
        app: "projekt-manager",
        version: 1,
        device: me,
        deviceName: navigator.userAgent.includes("Windows") ? "Windows-PC" : "PC",
        writtenAt: Date.now(),
        tables: useStore.getState().raw,
      };
      await native.writeTextFile(joinPath(devicesDir, `${me}.json`), JSON.stringify(file));
    }

    // 3. Anhänge in beide Richtungen kopieren
    await syncAttachments(dir);

    useStore.getState().set({ syncStatus: { state: "idle", last: Date.now() } });
  } catch (e) {
    useStore.getState().set({ syncStatus: { state: "error", error: String(e), last: store.syncStatus.last } });
  } finally {
    running = false;
    if (again) {
      again = false;
      setTimeout(syncNow, 500);
    }
  }
}

async function syncAttachments(dir: string) {
  const localDir = await attachmentsDir();
  const remoteDir = joinPath(dir, "attachments");
  const files = new Set(
    useStore
      .getState()
      .data.attachments.map((a) => a.file),
  );
  const local = new Set(await native.listFiles(localDir));
  const remote = new Set(await native.listFiles(remoteDir));
  for (const f of files) {
    if (local.has(f) && !remote.has(f)) await native.copyFile(joinPath(localDir, f), joinPath(remoteDir, f));
    else if (!local.has(f) && remote.has(f)) await native.copyFile(joinPath(remoteDir, f), joinPath(localDir, f));
  }
}

/** Holt einen einzelnen Anhang aus Google Drive, falls er lokal noch fehlt. */
export async function pullAttachment(file: string) {
  const localPath = joinPath(await attachmentsDir(), file);
  if (await native.fileExists(localPath)) return;
  const { enabled, dir } = await getSyncConfig();
  if (!enabled || !dir) return;
  const remotePath = joinPath(dir, "attachments", file);
  if (await native.fileExists(remotePath)) await native.copyFile(remotePath, localPath);
}

/** Startet den automatischen Sync: beim Start, alle 60 s, beim Fokussieren und kurz nach Änderungen. */
export async function startAutoSync() {
  const { enabled } = await getSyncConfig();
  useStore.getState().set({ syncStatus: { state: enabled ? "idle" : "off" } });

  useStore.setState({
    onChange: () => {
      // Andere Teile (z. B. Google Kalender) über Änderungen informieren
      window.dispatchEvent(new Event("slate:changed"));
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(syncNow, 3000);
    },
  });

  await syncNow();
  setInterval(syncNow, 60_000);
  window.addEventListener("focus", () => syncNow());
}
