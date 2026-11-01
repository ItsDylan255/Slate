import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  FolderKanban,
  Layout,
  Home,
  Keyboard,
  Languages,
  ListChecks,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SquareCheck,
  FileUp,
} from "lucide-react";
import { isDone, taskKey, useStore } from "../store";
import { matchesText } from "../lib/filter";
import { syncNow } from "../lib/sync";
import { useT } from "../i18n";

interface Item {
  id: string;
  group: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  run: () => void;
}

/** Befehlspalette (Strg+K): Aufgaben & Projekte finden und Aktionen ausführen. */
export function CommandPalette() {
  const t = useT();
  const d = useStore((s) => s.data);
  const lang = useStore((s) => s.lang);
  const dark = useStore((s) => s.dark);
  const view = useStore((s) => s.view);
  const { set, go, setDark, setLang } = useStore.getState();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => set({ paletteOpen: false });
  const currentProject = view.kind === "project" ? view.projectId : d.projects.find((p) => !p.archived)?.id;

  const items = useMemo<Item[]>(() => {
    const query = q.trim().toLowerCase();
    const match = (s: string) => !query || s.toLowerCase().includes(query);

    const actions: Item[] = [
      { id: "a-task", group: t("palette.actions"), icon: <Plus size={14} />, label: t("common.newTask"), hint: "N", run: () => set({ newTaskFor: { projectId: currentProject } }) },
      { id: "a-project", group: t("palette.actions"), icon: <FolderKanban size={14} />, label: t("project.new"), hint: "P", run: () => set({ projectDialog: {} }) },
      { id: "a-home", group: t("palette.actions"), icon: <Home size={14} />, label: t("nav.home"), hint: "G H", run: () => go({ kind: "home" }) },
      { id: "a-my", group: t("palette.actions"), icon: <ListChecks size={14} />, label: t("nav.myTasks"), hint: "G M", run: () => go({ kind: "my" }) },
      { id: "a-archive", group: t("palette.actions"), icon: <Archive size={14} />, label: t("nav.archive"), hint: "G A", run: () => go({ kind: "archive" }) },
      { id: "a-import", group: t("palette.actions"), icon: <FileUp size={14} />, label: t("import.title"), run: () => set({ importDialog: { projectId: currentProject } }) },
      { id: "a-settings", group: t("palette.actions"), icon: <Settings size={14} />, label: t("nav.settings"), hint: t("kbd.ctrlComma"), run: () => set({ settingsOpen: true }) },
      { id: "a-sync", group: t("palette.actions"), icon: <RefreshCw size={14} />, label: t("sync.now"), run: () => syncNow() },
      { id: "a-theme", group: t("palette.actions"), icon: <Moon size={14} />, label: dark ? t("theme.light") : t("theme.dark"), run: () => setDark(!dark) },
      { id: "a-lang", group: t("palette.actions"), icon: <Languages size={14} />, label: lang === "de" ? "Switch to English" : "Auf Deutsch umstellen", run: () => setLang(lang === "de" ? "en" : "de") },
      { id: "a-keys", group: t("palette.actions"), icon: <Keyboard size={14} />, label: t("shortcuts.title"), hint: "?", run: () => set({ shortcutsOpen: true }) },
    ].filter((a) => match(a.label));

    const projects: Item[] = d.projects
      .filter((p) => match(p.name) || match(p.key))
      .map((p) => ({
        id: "p-" + p.id,
        group: t("nav.projects"),
        icon: <Layout size={14} />,
        label: p.name,
        hint: p.archived ? t("nav.archive") : p.key,
        run: () => go({ kind: "project", projectId: p.id, tab: "board" }),
      }));

    const tasks: Item[] = query
      ? d.tasks
          .filter((x) => matchesText(x, q, taskKey(x, d.projects)))
          .slice(0, 30)
          .map((x) => ({
            id: "t-" + x.id,
            group: t("palette.tasks"),
            icon: <SquareCheck size={14} className={isDone(x, d.columns) ? "text-emerald-500" : ""} />,
            label: x.title,
            hint: taskKey(x, d.projects),
            run: () => set({ openTaskId: x.id }),
          }))
      : [];

    return query ? [...tasks, ...projects, ...actions] : [...actions, ...projects];
  }, [q, d, lang, dark, currentProject]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const runItem = (item?: Item) => {
    if (!item) return;
    close();
    item.run();
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl/10">
        <div className="flex items-center gap-2 border-b border-border px-4 ">
          <Search size={16} className="text-muted-foreground/70" />
          <input
            autoFocus
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/70"
            placeholder={t("palette.placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") close();
              if (e.key === "ArrowDown") (e.preventDefault(), setIndex((i) => Math.min(items.length - 1, i + 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setIndex((i) => Math.max(0, i - 1)));
              if (e.key === "Enter") runItem(items[index]);
            }}
          />
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1">
          {items.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t("palette.nothing")}</p>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header && <div className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">{header}</div>}
                <button
                  data-index={i}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => runItem(item)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${i === index ? "bg-accent" : ""}`}
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="font-mono text-xs text-muted-foreground/70">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
