import { ListPlus } from "lucide-react";
import { useStore } from "../../store";
import { useT } from "../../i18n";

/**
 * Symbol für "Weiter erstellen" (wie bei Kaneo): normal = an, durchgestrichen = aus.
 * Wenn an, bleibt der Dialog "Neue Aufgabe" nach dem Anlegen offen.
 */
export function CreateMoreToggle() {
  const t = useT();
  const on = useStore((s) => s.createMore);
  const setCreateMore = useStore((s) => s.setCreateMore);
  return (
    <button
      type="button"
      className={`btn-icon relative ${on ? "text-foreground" : ""}`}
      title={`${t("newTask.createMore")}: ${on ? t("common.on") : t("common.off")}`}
      onClick={() => setCreateMore(!on)}
    >
      <ListPlus className="size-4" />
      {!on && (
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute inset-0 m-auto size-4" aria-hidden="true">
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
