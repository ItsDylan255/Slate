import { useMemo, useState } from "react";
import { Check, ClipboardCopy, FileUp } from "lucide-react";
import { useStore } from "../../store";
import { importStats, parseImport, pickImportFile, runImport, JSON_EXAMPLE, TEXT_EXAMPLE } from "../../lib/importer";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { useT } from "../../i18n";

/** Projekte oder Aufgaben aus Text bzw. Datei (JSON, Markdown) importieren. */
export function ImportDialog() {
  const t = useT();
  const req = useStore((s) => s.importDialog)!;
  const allProjects = useStore((s) => s.data.projects);
  const projects = allProjects.filter((p) => !p.archived);
  const { set, go } = useStore.getState();
  const close = () => set({ importDialog: null });

  const [mode, setMode] = useState<"new" | "existing">(req.projectId ? "existing" : "new");
  const [projectId, setProjectId] = useState(req.projectId ?? projects[0]?.id ?? "");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [name, setName] = useState("");
  const [help, setHelp] = useState<"text" | "json" | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseImport(text), [text]);
  const stats = importStats(parsed.projects);
  const needsName = mode === "new" && parsed.projects.length > 0 && !parsed.projects[0].name;
  const canImport = !busy && !parsed.error && stats.tasks + (mode === "new" ? stats.projects : 0) > 0 && (mode === "new" || !!projectId);

  const doImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await runImport(parsed.projects, mode === "new" ? { mode, name: name || fileName } : { mode, projectId });
      go({ kind: "project", projectId: res.projectId, tab: "board" });
      close();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const example = help === "json" ? JSON_EXAMPLE : TEXT_EXAMPLE;

  return (
    <Modal title={t("import.title")} onClose={close} size="lg">
      <div className="space-y-4" onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="segmented">
            {(["new", "existing"] as const).map((m) => (
              <button key={m} className={`segmented-item ${mode === m ? "segmented-active" : ""}`} onClick={() => setMode(m)} disabled={m === "existing" && !projects.length}>
                {t(m === "new" ? "import.asNew" : "import.intoExisting")}
              </button>
            ))}
          </div>
          {mode === "existing" && (
            <Select
              value={projectId}
              onChange={setProjectId}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              className="w-56"
            />
          )}
          <button className="btn-outline ml-auto" onClick={async () => {
            try {
              const f = await pickImportFile();
              if (f) (setText(f.text), setFileName(f.name));
            } catch (e) {
              setError(String(e));
            }
          }}>
            <FileUp size={14} /> {t("import.openFile")}
          </button>
        </div>

        <textarea
          autoFocus
          className="input min-h-64 resize-y font-mono text-xs leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("import.placeholder")}
          spellCheck={false}
        />

        {needsName && (
          <div>
            <label className="label">{t("project.name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={fileName || t("import.defaultName")} />
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {t("import.formats")}{" "}
          <button className="text-info hover:underline" onClick={() => setHelp(help === "text" ? null : "text")}>{t("import.textFormat")}</button>
          {" · "}
          <button className="text-info hover:underline" onClick={() => setHelp(help === "json" ? null : "json")}>{t("import.jsonFormat")}</button>
        </div>

        {help && (
          <div className="rounded-lg bg-muted p-4 text-xs text-muted-foreground">
            <p className="mb-2 whitespace-pre-line">{t(help === "json" ? "import.jsonHelp" : "import.textHelp")}</p>
            <pre className="selectable max-h-56 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] text-foreground">{example}</pre>
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost h-7 px-2 text-xs" onClick={() => setText(example)}>{t("import.useExample")}</button>
              <button
                className="btn-ghost h-7 px-2 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(example);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check size={13} /> : <ClipboardCopy size={13} />} {t("import.copyExample")}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className={`text-xs ${parsed.error || error ? "text-destructive" : "text-muted-foreground"}`}>
            {error
              ? error
              : parsed.error
                ? parsed.error === "backup"
                  ? t("import.isBackup")
                  : t("import.invalid", { e: parsed.error })
                : text.trim()
                  ? t(mode === "new" ? "import.previewNew" : "import.previewExisting", stats)
                  : ""}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={close}>{t("common.cancel")}</button>
            <button className="btn-primary" disabled={!canImport} onClick={doImport}>{t("import.run")}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
