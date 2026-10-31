import type { ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, usePopover } from "./Popover";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * Eigenes Auswahlfeld statt des System-Dropdowns (das unter Windows weiß aufklappt).
 * variant "input" = mit Rahmen (Formulare), "ghost" = ohne Rahmen (Eigenschaften-Spalte).
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  variant = "input",
  className = "",
  menuClassName = "w-56",
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  variant?: "input" | "ghost";
  className?: string;
  menuClassName?: string;
}) {
  const pop = usePopover();
  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        onClick={pop.open}
        className={`${variant === "ghost" ? "input-ghost" : "input"} flex items-center gap-2 text-left ${className}`}
      >
        {current?.icon && <span className="flex shrink-0 items-center text-muted-foreground">{current.icon}</span>}
        <span className="min-w-0 flex-1 truncate">{current?.label ?? "–"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/70" />
      </button>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close} className={menuClassName}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                pop.close();
              }}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent ${
                o.value === value ? "font-medium" : ""
              }`}
            >
              {o.icon && <span className="flex w-4 shrink-0 items-center justify-center text-muted-foreground">{o.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value && <Check className="size-3.5 shrink-0" />}
            </button>
          ))}
        </Popover>
      )}
    </>
  );
}
