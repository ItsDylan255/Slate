import { useEffect, useState } from "react";
import { File, FolderOpen, Paperclip, Upload, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useStore } from "../../store";
import type { Attachment } from "../../lib/types";
import { attachmentPath, imageDataUrl, importAttachment, isImage } from "../../lib/files";
import { native } from "../../lib/native";
import { formatFileSize } from "../../lib/dates";
import { pullAttachment } from "../../lib/sync";
import { useT } from "../../i18n";

/** Dateien an Aufgaben hängen: per Knopf oder per Drag & Drop aus dem Explorer. */
export function Attachments({ taskId }: { taskId: string }) {
  const t = useT();
  const list = useStore((s) => s.data.attachments).filter((a) => a.task_id === taskId);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (paths: string[]) => {
    setError(null);
    for (const p of paths) {
      try {
        const att = await importAttachment(p);
        await useStore.getState().addAttachment(taskId, att);
      } catch (e) {
        setError(String(e));
      }
    }
  };

  // Dateien aus dem Windows-Explorer ins Fenster ziehen
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type === "enter" || e.payload.type === "over") setDragging(true);
        else if (e.payload.type === "leave") setDragging(false);
        else if (e.payload.type === "drop") {
          setDragging(false);
          addFiles(e.payload.paths);
        }
      })
      .then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async () => {
    const res = await open({ multiple: true, directory: false });
    if (res) addFiles(Array.isArray(res) ? res : [res]);
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="section-title">{t("task.attachments")}</h3>
        <button className="btn-icon h-5 w-5" onClick={pick} title={t("task.addFile")}>
          <Paperclip size={12} />
        </button>
      </div>
      {dragging && (
        <div className="mb-2 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-ring bg-accent p-4 text-sm text-foreground">
          <Upload size={16} /> {t("task.dropFiles")}
        </div>
      )}
      {error && <p className="mb-2 text-xs text-destructive-foreground">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        {list.map((a) => (
          <AttachmentItem key={a.id} att={a} />
        ))}
      </div>
      {list.length === 0 && !dragging && <p className="px-1 text-xs text-muted-foreground/70">{t("task.noFiles")}</p>}
    </section>
  );
}

function AttachmentItem({ att }: { att: Attachment }) {
  const t = useT();
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage(att.name)) return;
    (async () => {
      await pullAttachment(att.file);
      setPreview(await imageDataUrl(att.file).catch(() => null));
    })();
  }, [att.file, att.name]);

  const openFile = async () => {
    await pullAttachment(att.file);
    await native.openPath(await attachmentPath(att.file));
  };

  return (
    <div className="group relative flex items-center gap-2 overflow-hidden rounded-lg border border-border p-2 ">
      <button onClick={openFile} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={t("task.openFile")}>
        {preview ? (
          <img src={preview} className="h-10 w-10 shrink-0 rounded object-cover" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent text-muted-foreground">
            <File size={16} />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm">{att.name}</span>
          <span className="text-xs text-muted-foreground/70">{formatFileSize(att.size)}</span>
        </span>
      </button>
      <div className="flex shrink-0 opacity-0 group-hover:opacity-100">
        <button className="btn-icon h-6 w-6" title={t("task.showInFolder")} onClick={async () => native.revealPath(await attachmentPath(att.file))}>
          <FolderOpen size={12} />
        </button>
        <button className="btn-icon h-6 w-6" title={t("common.delete")} onClick={() => useStore.getState().remove("attachments", att.id)}>
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
