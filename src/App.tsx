import { useCallback, useEffect, useState } from "react";
import { useStore } from "./store";
import { applyFilters } from "./lib/filter";
import { startAutoSync } from "./lib/sync";
import { startReminders } from "./lib/reminders";
import { restoreNewestBackup, startBackups } from "./lib/backup";
import { startGcal } from "./lib/gcal";
import { native } from "./lib/native";
import { useGlobalShortcuts } from "./lib/shortcuts";
import { Sidebar } from "./components/Sidebar";
import { BulkBar } from "./components/BulkBar";
import { CommandPalette } from "./components/CommandPalette";
import { TaskContextMenu } from "./components/TaskContextMenu";
import { TaskDialog } from "./components/taskdialog/TaskDialog";
import { ProjectDialog } from "./components/dialogs/ProjectDialog";
import { NewTaskDialog } from "./components/dialogs/NewTaskDialog";
import { SettingsDialog } from "./components/dialogs/SettingsDialog";
import { ShortcutsDialog } from "./components/dialogs/ShortcutsDialog";
import { HomeView } from "./views/HomeView";
import { MyTasksView } from "./views/MyTasksView";
import { ArchiveView } from "./views/ArchiveView";
import { ProjectView } from "./views/ProjectView";

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const dark = useStore((s) => s.dark);
  const lang = useStore((s) => s.lang);
  const view = useStore((s) => s.view);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const openTaskId = useStore((s) => s.openTaskId);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const projectDialog = useStore((s) => s.projectDialog);
  const newTaskFor = useStore((s) => s.newTaskFor);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    useStore
      .getState()
      .init()
      .then(async () => {
        // Nach einer Reparatur: neuestes automatisches Backup zurückholen
        if (loadFlag("restoreAfterRepair")) {
          clearFlag("restoreAfterRepair");
          await restoreNewestBackup().catch((e) => console.error(e));
        }
        startAutoSync();
        startReminders().catch(() => {});
        startBackups();
        startGcal().catch(() => {});
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Neue Aufgabe -> gleiches Fenster wie beim Bearbeiten
  const hasProjects = useStore((s) => s.data.projects.some((p) => !p.archived));
  useEffect(() => {
    if (newTaskFor && hasProjects) useStore.getState().startNewTask(newTaskFor);
  }, [newTaskFor, hasProjects]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.lang = lang;
  }, [dark, lang]);

  // Für Strg+A: alle Aufgaben, die in der aktuellen Ansicht zu sehen sind
  const visibleTaskIds = useCallback(() => {
    const s = useStore.getState();
    const base = s.data.tasks.filter((x) => !x.archived);
    if (s.view.kind === "project") {
      const pid = s.view.projectId;
      return applyFilters(base.filter((x) => x.project_id === pid), s.filters, s.data).map((x) => x.id);
    }
    if (s.view.kind === "my") return applyFilters(base, s.filters, s.data).map((x) => x.id);
    return [];
  }, []);
  useGlobalShortcuts(visibleTaskIds);

  if (error) return <StartupError error={error} />;
  if (!loaded) return null;

  return (
    <div className="flex h-full bg-sidebar">
      {/* Einklappbare Seitenleiste (Strg+B), schiebt sich wie bei Kaneo komplett aus dem Bild */}
      <div className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${sidebarOpen ? "w-64" : "w-0"}`}>
        <Sidebar />
      </div>
      {/* Inhalt als eingerückte Fläche neben der Seitenleiste (wie Kaneos "inset"-Layout) */}
      <main className={`m-2 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-background shadow-sm/5 ${sidebarOpen ? "ml-0" : ""}`}>
        {view.kind === "home" && <HomeView />}
        {view.kind === "my" && <MyTasksView />}
        {view.kind === "archive" && <ArchiveView />}
        {view.kind === "project" && <ProjectView key={view.projectId} projectId={view.projectId} tab={view.tab} />}
      </main>

      <BulkBar />
      <TaskContextMenu />
      {openTaskId && <TaskDialog taskId={openTaskId} />}
      {newTaskFor && !hasProjects && <NewTaskDialog />}
      {projectDialog && <ProjectDialog key={projectDialog.projectId ?? "new"} />}
      {settingsOpen && <SettingsDialog />}
      {shortcutsOpen && <ShortcutsDialog />}
      {paletteOpen && <CommandPalette />}
    </div>
  );
}

const loadFlag = (k: string) => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const clearFlag = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* egal */
  }
};

/**
 * Fehlerseite beim Start. Bei einer beschädigten Datenbank kann sie repariert werden:
 * Die defekte Datei wird beiseitegelegt, die App startet neu und holt das neueste automatische Backup zurück.
 */
function StartupError({ error }: { error: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const repair = async () => {
    setBusy(true);
    try {
      await native.quarantineDatabase();
      localStorage.setItem("restoreAfterRepair", "1");
      location.reload();
    } catch (e) {
      setMsg(String(e));
      setBusy(false);
    }
  };
  return (
    <div className="selectable flex h-full items-center justify-center bg-background p-8">
      <div className="max-w-xl space-y-4 rounded-xl border border-border bg-popover p-6 text-sm">
        <p className="text-base font-semibold">Slate konnte nicht starten</p>
        <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground">{error}</pre>
        <p className="text-muted-foreground">
          Mit „Reparieren“ wird die Datenbank beiseitegelegt (sie bleibt im Datenordner im Unterordner „defekt-…“ erhalten) und das
          neueste automatische Backup wiederhergestellt. Mit Google Drive Sync kommen danach auch die Daten der anderen PCs zurück.
        </p>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy} onClick={repair}>
            {busy ? "Repariere …" : "Reparieren"}
          </button>
          <button className="btn-outline" onClick={() => location.reload()}>
            Erneut versuchen
          </button>
        </div>
        {msg && <p className="text-destructive-foreground">{msg}</p>}
      </div>
    </div>
  );
}
