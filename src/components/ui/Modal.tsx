import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useT } from "../../i18n";

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** "sheet" = Panel, das von rechts hereinkommt (wie Kaneos Aufgabenansicht) */
  variant?: "dialog" | "sheet";
  headerRight?: ReactNode;
  noPadding?: boolean;
}

const SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

export function Modal({ title, onClose, children, size = "sm", variant = "dialog", headerRight, noPadding }: Props) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sheet = variant === "sheet";

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-black/32 backdrop-blur-[1px] ${sheet ? "justify-end p-2" : "items-start justify-center p-6 pt-[10vh]"}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`flex w-full flex-col border border-border bg-popover shadow-2xl/10 ${
          sheet ? `h-full max-w-[min(64rem,92vw)] animate-[sheet-in_180ms_cubic-bezier(0.23,1,0.32,1)] rounded-xl` : `max-h-[84vh] rounded-2xl ${SIZES[size]}`
        }`}
      >
        <div className={`flex shrink-0 items-center gap-2 border-b border-border ${sheet ? "h-12 px-4" : "px-5 py-3.5"}`}>
          <h2 className={`flex-1 truncate ${sheet ? "text-sm font-normal" : "text-base font-semibold"}`}>{title}</h2>
          {headerRight}
          <button onClick={onClose} className="btn-icon" title={t("common.closeEsc")}>
            <X className="size-4" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${noPadding ? "" : "p-5"}`}>{children}</div>
      </div>
    </div>
  );
}
