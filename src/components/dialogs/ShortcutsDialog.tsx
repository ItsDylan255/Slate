import { useStore } from "../../store";
import { SHORTCUTS } from "../../lib/shortcuts";
import { Modal } from "../ui/Modal";
import { useT } from "../../i18n";

export function ShortcutsList() {
  const t = useT();
  return (
    <div className="divide-y divide-border">
      {SHORTCUTS.map((s) => (
        <div key={s.keys} className="flex items-center justify-between py-2 text-sm">
          <span>{t(s.label)}</span>
          <span className="flex gap-1">
            {s.keys
              .replace("Ctrl", t("kbd.ctrl"))
              .replace("Del", t("kbd.del"))
              .split(" ")
              .map((k, i) => (
                <kbd key={i} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs ">
                  {k}
                </kbd>
              ))}
          </span>
        </div>
      ))}
      <p className="pt-3 text-xs text-muted-foreground">{t("shortcuts.mouse")}</p>
    </div>
  );
}

export function ShortcutsDialog() {
  const t = useT();
  return (
    <Modal title={t("shortcuts.title")} onClose={() => useStore.getState().set({ shortcutsOpen: false })}>
      <ShortcutsList />
    </Modal>
  );
}
