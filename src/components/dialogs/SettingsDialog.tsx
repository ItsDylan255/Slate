import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { CalendarDays, Cloud, Database, Download, FolderOpen, Keyboard, Palette, RefreshCw, Sheet, Tag, Trash2, Upload, History, RotateCcw } from "lucide-react";
import { useStore } from "../../store";
import { COLORS } from "../../lib/priority";
import { getSyncConfig, setSyncConfig, suggestSyncDir, syncNow } from "../../lib/sync";
import { exportBackup, exportCsv, exportIcs, importBackup } from "../../lib/export";
import { native } from "../../lib/native";
import { BACKUP_SLOTS, backupDir, backupTimes, restoreBackup, type SlotKey } from "../../lib/backup";
import { ask } from "@tauri-apps/plugin-dialog";
import { formatDateTime } from "../../lib/dates";
import { Modal } from "../ui/Modal";
import { ConfirmButton } from "../ui/ConfirmButton";
import { ShortcutsList } from "./ShortcutsDialog";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";
import { useT, type TKey } from "../../i18n";

type Tab = "general" | "labels" | "sync" | "gcal" | "data" | "shortcuts";
const TABS: { id: Tab; label: TKey; icon: typeof Palette }[] = [
  { id: "general", label: "settings.general", icon: Palette },
  { id: "labels", label: "task.labels", icon: Tag },
  { id: "sync", label: "settings.sync", icon: Cloud },
  { id: "gcal", label: "settings.gcal", icon: CalendarDays },
  { id: "data", label: "settings.data", icon: Database },
  { id: "shortcuts", label: "shortcuts.title", icon: Keyboard },
];

export function SettingsDialog() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("general");
  return (
    <Modal title={t("nav.settings")} onClose={() => useStore.getState().set({ settingsOpen: false })} size="lg" noPadding>
      <div className="flex min-h-[32rem]">
        <nav className="w-48 shrink-0 space-y-0.5 border-r border-border p-2 ">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                tab === id ? "bg-accent font-medium " : "text-muted-foreground hover:bg-accent dark:text-muted-foreground/70 "
              }`}
            >
              <Icon size={14} /> {t(label)}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 p-6" onKeyDown={(e) => e.stopPropagation()}>
          {tab === "general" && <General />}
          {tab === "labels" && <Labels />}
          {tab === "sync" && <Sync />}
          {tab === "gcal" && <GoogleCalendarSettings />}
          {tab === "data" && <DataTab />}
          {tab === "shortcuts" && <ShortcutsList />}
        </div>
      </div>
    </Modal>
  );
}

function General() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const dark = useStore((s) => s.dark);
  const { setLang, setDark } = useStore.getState();
  const Opt = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-3 text-sm ${active ? "border-foreground/30 bg-accent font-medium" : "border-border hover:bg-accent "}`}
    >
      {children}
    </button>
  );
  return (
    <div className="space-y-6">
      <div>
        <label className="label">{t("settings.language")}</label>
        <div className="flex gap-2">
          <Opt active={lang === "de"} onClick={() => setLang("de")}>
            Deutsch
          </Opt>
          <Opt active={lang === "en"} onClick={() => setLang("en")}>
            English
          </Opt>
        </div>
      </div>
      <div>
        <label className="label">{t("settings.theme")}</label>
        <div className="flex gap-2">
          <Opt active={!dark} onClick={() => setDark(false)}>
            ☀️ {t("theme.lightShort")}
          </Opt>
          <Opt active={dark} onClick={() => setDark(true)}>
            🌙 {t("theme.darkShort")}
          </Opt>
        </div>
      </div>
    </div>
  );
}

function Labels() {
  const t = useT();
  const labels = useStore((s) => s.data.labels);
  const usage = useStore((s) => s.data.task_labels);
  const { createLabel, patch, remove } = useStore.getState();
  const [name, setName] = useState("");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("labels.hint")}</p>
      <div className="space-y-2">
        {labels.map((l) => (
          <div key={l.id} className="flex items-center gap-2">
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => patch("labels", l.id, { color: c })}
                  className={`h-4 w-4 rounded-full ${l.color === c ? "ring-2 ring-ring ring-offset-1 ring-offset-popover" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <input
              className="input py-1"
              defaultValue={l.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && patch("labels", l.id, { name: e.target.value.trim() })}
            />
            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground/70">{t("labels.used", { n: usage.filter((u) => u.label_id === l.id).length })}</span>
            <ConfirmButton className="btn-icon shrink-0" confirmText="?" onConfirm={() => remove("labels", l.id)}>
              <Trash2 size={13} />
            </ConfirmButton>
          </div>
        ))}
        {labels.length === 0 && <p className="text-sm text-muted-foreground/70">{t("labels.none")}</p>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await createLabel(name.trim(), COLORS[labels.length % COLORS.length]);
          setName("");
        }}
      >
        <input className="input" placeholder={t("labels.newName")} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={!name.trim()}>
          {t("common.add")}
        </button>
      </form>
    </div>
  );
}

function Sync() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const status = useStore((s) => s.syncStatus);
  const [enabled, setEnabled] = useState(false);
  const [dir, setDir] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [detected, setDetected] = useState<string>("");

  useEffect(() => {
    (async () => {
      const cfg = await getSyncConfig();
      const suggestion = await suggestSyncDir();
      setDetected(suggestion);
      setEnabled(cfg.enabled);
      setDir(cfg.dir || suggestion);
      setLoaded(true);
    })();
  }, []);

  const browse = async () => {
    const res = await open({ directory: true, multiple: false, defaultPath: dir || undefined });
    if (typeof res === "string") setDir(res);
  };

  if (!loaded) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground dark:text-muted-foreground/70">
        <p className="mb-2 font-medium text-foreground">{t("sync.howTitle")}</p>
        <p>{t("sync.howText")}</p>
      </div>

      {detected ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <Cloud size={14} /> {t("sync.driveFound", { path: detected.replace(/\\[^\\]+$/, "") })}
        </p>
      ) : (
        <p className="text-sm text-warning">{t("sync.driveMissing")}</p>
      )}

      <div>
        <label className="label">{t("sync.folder")}</label>
        <div className="flex gap-2">
          <input className="input font-mono text-xs" value={dir} onChange={(e) => setDir(e.target.value)} />
          <button className="btn-ghost shrink-0 border border-border" onClick={browse}>
            <FolderOpen size={14} /> {t("common.browse")}
          </button>
        </div>
        {detected && dir !== detected && (
          <button className="mt-1 text-xs text-info hover:underline" onClick={() => setDir(detected)}>
            {t("sync.useDrive")}
          </button>
        )}
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={enabled}
          onChange={async (e) => {
            setEnabled(e.target.checked);
            await setSyncConfig(e.target.checked, dir);
          }}
        />
        <span className="text-sm font-medium">{t("sync.enable")}</span>
      </label>

      {enabled && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={async () => (await setSyncConfig(true, dir), syncNow())}>
            <RefreshCw size={14} className={status.state === "syncing" ? "animate-spin" : ""} /> {t("sync.now")}
          </button>
          <span className="text-xs text-muted-foreground">
            {status.state === "error"
              ? `${t("sync.error")}: ${status.error}`
              : status.last
                ? t("sync.last", { time: formatDateTime(status.last, lang) })
                : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function DataTab() {
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, ok: (r: unknown) => string) => async () => {
    setMsg(null);
    try {
      const r = await fn();
      if (r !== null && r !== undefined) setMsg(ok(r));
    } catch (e) {
      setMsg(`${t("common.error")}: ${e}`);
    }
  };

  const Item = ({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action: React.ReactNode }) => (
    <div className="flex items-center gap-4 rounded-lg border border-border p-4 ">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{text}</div>
      </div>
      {action}
    </div>
  );

  return (
    <div className="space-y-3">
      <AutoBackups onMessage={setMsg} />
      <Item
        icon={<Download size={18} />}
        title={t("backup.export")}
        text={t("backup.exportText")}
        action={<button className="btn-primary shrink-0" onClick={run(exportBackup, (p) => t("backup.saved", { path: String(p) }))}>{t("backup.exportBtn")}</button>}
      />
      <Item
        icon={<Upload size={18} />}
        title={t("backup.import")}
        text={t("backup.importText")}
        action={<button className="btn-ghost shrink-0 border border-border" onClick={run(importBackup, (n) => t("backup.imported", { n: Number(n) }))}>{t("backup.importBtn")}</button>}
      />
      <Item
        icon={<Sheet size={18} />}
        title={t("csv.title")}
        text={t("csv.text")}
        action={<button className="btn-ghost shrink-0 border border-border" onClick={run(exportCsv, (p) => t("backup.saved", { path: String(p) }))}>{t("common.export")}</button>}
      />
      <Item
        icon={<CalendarDays size={18} />}
        title={t("ics.title")}
        text={t("ics.text")}
        action={<button className="btn-ghost shrink-0 border border-border" onClick={run(exportIcs, (p) => t("backup.saved", { path: String(p) }))}>{t("common.export")}</button>}
      />
      <Item
        icon={<FolderOpen size={18} />}
        title={t("data.folder")}
        text={t("data.folderText")}
        action={<button className="btn-ghost shrink-0 border border-border" onClick={async () => native.openPath(await native.appDataPath())}>{t("common.open")}</button>}
      />
      {msg && <p className="selectable rounded-md bg-muted p-3 text-xs text-muted-foreground dark:text-muted-foreground/70">{msg}</p>}
    </div>
  );
}

/** Liste der vier automatischen Backups mit "Wiederherstellen". */
function AutoBackups({ onMessage }: { onMessage: (m: string | null) => void }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [times, setTimes] = useState<Record<SlotKey, number | null> | null>(null);

  useEffect(() => {
    backupTimes().then(setTimes);
  }, []);

  const labels: Record<SlotKey, TKey> = { daily: "backup.daily", "3days": "backup.3days", weekly: "backup.weekly", monthly: "backup.monthly" };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center gap-4">
        <span className="text-muted-foreground">
          <History size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t("backup.auto")}</div>
          <div className="text-xs text-muted-foreground">{t("backup.autoText")}</div>
        </div>
        <button className="btn-outline shrink-0" onClick={async () => native.openPath(await backupDir())}>
          <FolderOpen size={14} /> {t("common.open")}
        </button>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {BACKUP_SLOTS.map((slot) => {
          const at = times?.[slot.key];
          return (
            <div key={slot.key} className="flex h-10 items-center gap-3 px-3 text-[13px]">
              <span className="w-28 shrink-0 font-medium">{t(labels[slot.key])}</span>
              <span className="flex-1 text-muted-foreground">{at ? formatDateTime(at, lang) : t("backup.none")}</span>
              {at && (
                <button
                  className="btn-ghost h-7 px-2 text-xs"
                  onClick={async () => {
                    if (!(await ask(t("backup.confirmRestore"), { kind: "warning" }))) return;
                    try {
                      const n = await restoreBackup(slot.key);
                      onMessage(t("backup.restored", { n }));
                    } catch (e) {
                      onMessage(`${t("common.error")}: ${e}`);
                    }
                  }}
                >
                  <RotateCcw size={13} /> {t("backup.restore")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
