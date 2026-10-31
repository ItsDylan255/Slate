import { useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../../store";
import { useT } from "../../i18n";

export function Links({ taskId }: { taskId: string }) {
  const t = useT();
  const links = useStore((s) => s.data.links).filter((l) => l.task_id === taskId);
  const { addLink, remove } = useStore.getState();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const save = async () => {
    let u = url.trim();
    if (!u) return;
    if (!/^[a-z]+:\/\//i.test(u)) u = "https://" + u;
    await addLink(taskId, u, title.trim());
    setUrl("");
    setTitle("");
    setAdding(false);
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="section-title">{t("task.links")}</h3>
        <button className="btn-icon h-5 w-5" onClick={() => setAdding(true)} title={t("task.addLink")}>
          <Plus size={12} />
        </button>
      </div>
      <div className="space-y-1">
        {links.map((l) => (
          <div key={l.id} className="group flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent">
            <ExternalLink size={13} className="shrink-0 text-muted-foreground/70" />
            <button className="min-w-0 flex-1 truncate text-left text-info hover:underline" onClick={() => openUrl(l.url)} title={l.url}>
              {l.title || l.url}
            </button>
            <button className="btn-icon h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => remove("links", l.id)}>
              <X size={12} />
            </button>
          </div>
        ))}
        {adding && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") setAdding(false);
            }}
          >
            <input autoFocus className="input py-1 text-xs" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input className="input py-1 text-xs" placeholder={t("task.linkTitle")} value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="btn-primary shrink-0 px-2 py-1 text-xs">{t("common.add")}</button>
          </form>
        )}
        {links.length === 0 && !adding && <p className="px-1 text-xs text-muted-foreground/70">{t("task.noLinks")}</p>}
      </div>
    </section>
  );
}
