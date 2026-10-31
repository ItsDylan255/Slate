import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../../i18n";

/** Löschen-Knopf mit Sicherheitsabfrage: erster Klick fragt nach, zweiter Klick führt aus. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmText,
  className = "btn-danger",
  title,
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmText?: string;
  className?: string;
  title?: string;
}) {
  const t = useT();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      title={title}
      className={`${className} ${armed ? "w-auto! bg-destructive! px-2! text-white!" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) onConfirm();
        else setArmed(true);
      }}
    >
      {armed ? (confirmText ?? t("common.confirmDelete")) : children}
    </button>
  );
}
