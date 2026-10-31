import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Offene Popover von unten nach oben – nur das oberste reagiert auf Esc und Klicks daneben. */
const stack: number[] = [];
let nextId = 1;

/** Position zum Aufklappen: Punkt (Rechtsklick) oder Rechteck eines Knopfs (h = Höhe zum Hochklappen). */
export type Anchor = { x: number; y: number; h?: number };

/** Kleines Aufklapp-Fenster an einer Position (z. B. unter einem Knopf). Schließt bei Klick daneben oder Esc. */
export function Popover({
  anchor,
  onClose,
  children,
  className = "w-56",
}: {
  anchor: Anchor | HTMLElement;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let x: number, y: number, ah = 0;
    if (anchor instanceof HTMLElement) {
      const r = anchor.getBoundingClientRect();
      x = r.left;
      y = r.bottom + 4;
      ah = r.height + 8;
    } else ({ x, y, h: ah = 0 } = anchor);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
      top: y + h > window.innerHeight - 8 ? Math.max(8, y - h - ah) : y,
      ready: true,
    });
  }, [anchor]);

  useEffect(() => {
    id.current = nextId++;
    stack.push(id.current);
    const isTop = () => stack[stack.length - 1] === id.current;
    const onDown = (e: MouseEvent) => {
      if (!isTop() || !ref.current || ref.current.contains(e.target as Node)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTop()) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      stack.splice(stack.indexOf(id.current), 1);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" }}
      className={`fixed z-[60] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-lg/10 ${className}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  active,
  right,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  right?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
        danger
          ? "text-destructive-foreground hover:bg-destructive/8"
          : "hover:bg-accent"
      } ${active ? "bg-accent font-medium " : ""}`}
    >
      {icon && <span className="flex w-4 shrink-0 justify-center text-muted-foreground">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {right}
    </button>
  );
}

export const MenuSeparator = () => <div className="my-1 h-px bg-accent" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{children}</div>
);

/** Hilfs-Hook: Knopf + Popover. */
export function usePopover() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  return {
    anchor,
    open: (e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setAnchor({ x: r.left, y: r.bottom + 4, h: r.height + 8 });
    },
    close: () => setAnchor(null),
  };
}
