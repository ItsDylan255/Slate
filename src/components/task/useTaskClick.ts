import type React from "react";
import { useStore } from "../../store";

/**
 * Einheitliches Klickverhalten für Aufgaben in allen Ansichten:
 * Klick = öffnen · Strg+Klick = zur Auswahl hinzufügen · Umschalt+Klick = Bereich auswählen · Rechtsklick = Menü
 */
export function useTaskClick(orderedIds: string[]) {
  const set = useStore((s) => s.set);

  const onClick = (e: React.MouseEvent, id: string) => {
    const { selection } = useStore.getState();
    if (e.ctrlKey || e.metaKey) {
      set({ selection: selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id] });
    } else if (e.shiftKey && selection.length > 0) {
      const last = selection[selection.length - 1];
      const a = orderedIds.indexOf(last);
      const b = orderedIds.indexOf(id);
      if (a < 0 || b < 0) return set({ selection: [...selection, id] });
      const range = orderedIds.slice(Math.min(a, b), Math.max(a, b) + 1);
      set({ selection: Array.from(new Set([...selection, ...range])) });
    } else if (selection.length > 0) {
      set({ selection: [] });
      set({ openTaskId: id });
    } else {
      set({ openTaskId: id });
    }
  };

  const onContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    set({ menu: { x: e.clientX, y: e.clientY, taskId: id } });
  };

  return { onClick, onContextMenu };
}
