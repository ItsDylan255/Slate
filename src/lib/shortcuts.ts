// Globale Tastenkürzel. Die Liste wird auch im Tastenkürzel-Fenster (?) angezeigt.
import { useEffect } from "react";
import { useStore, type ProjectView } from "../store";
import type { TKey } from "../i18n";

export const SHORTCUTS: { keys: string; label: TKey }[] = [
  { keys: "Ctrl K", label: "shortcuts.palette" },
  { keys: "N", label: "common.newTask" },
  { keys: "P", label: "project.new" },
  { keys: "/", label: "shortcuts.search" },
  { keys: "G H", label: "nav.home" },
  { keys: "G M", label: "nav.myTasks" },
  { keys: "G A", label: "nav.archive" },
  { keys: "1 – 5", label: "shortcuts.views" },
  { keys: "Ctrl A", label: "shortcuts.selectAll" },
  { keys: "Del", label: "shortcuts.deleteSelected" },
  { keys: "E", label: "shortcuts.archiveSelected" },
  { keys: "Ctrl ,", label: "nav.settings" },
  { keys: "Ctrl B", label: "nav.toggleSidebar" },
  { keys: "Ctrl D", label: "shortcuts.theme" },
  { keys: "?", label: "shortcuts.title" },
  { keys: "Esc", label: "shortcuts.escape" },
];

const TABS: ProjectView[] = ["board", "list", "backlog", "calendar", "gantt"];

export function useGlobalShortcuts(visibleTaskIds: () => string[]) {
  useEffect(() => {
    let pendingG = 0;

    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.set({ paletteOpen: !s.paletteOpen });
        return;
      }
      if (ctrl && e.key === ",") {
        e.preventDefault();
        s.set({ settingsOpen: true });
        return;
      }
      if (ctrl && e.key.toLowerCase() === "b") {
        e.preventDefault();
        s.toggleSidebar();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.setDark(!s.dark);
        return;
      }

      const modalOpen = s.openTaskId || s.paletteOpen || s.settingsOpen || s.shortcutsOpen || s.projectDialog || s.newTaskFor;
      if (typing || modalOpen) return;

      if (e.key === "Escape") {
        if (s.menu) s.set({ menu: null });
        else if (s.selection.length) s.set({ selection: [] });
        return;
      }
      if (ctrl && e.key.toLowerCase() === "a") {
        e.preventDefault();
        s.set({ selection: visibleTaskIds() });
        return;
      }
      if (ctrl || e.altKey) return;

      if (pendingG && Date.now() - pendingG < 1000) {
        pendingG = 0;
        const k = e.key.toLowerCase();
        if (k === "h") s.go({ kind: "home" });
        if (k === "m") s.go({ kind: "my" });
        if (k === "a") s.go({ kind: "archive" });
        return;
      }

      switch (e.key) {
        case "g":
        case "G":
          pendingG = Date.now();
          break;
        case "n":
        case "N": {
          e.preventDefault();
          const v = s.view;
          const projectId = v.kind === "project" ? v.projectId : s.data.projects.find((p) => !p.archived)?.id;
          s.set({ newTaskFor: { projectId, columnId: v.kind === "project" && v.tab === "backlog" ? null : undefined } });
          break;
        }
        case "p":
        case "P":
          e.preventDefault();
          s.set({ projectDialog: {} });
          break;
        case "/":
          e.preventDefault();
          document.getElementById("filter-search")?.focus();
          break;
        case "?":
          s.set({ shortcutsOpen: true });
          break;
        case "Delete":
          if (s.selection.length) s.deleteTasks(s.selection);
          break;
        case "e":
        case "E":
          if (s.selection.length) s.updateTasks(s.selection, { archived: 1 }).then(() => s.set({ selection: [] }));
          break;
        default:
          if (/^[1-5]$/.test(e.key) && s.view.kind === "project") {
            s.go({ ...s.view, tab: TABS[Number(e.key) - 1] });
          }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleTaskIds]);
}
