import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface DropdownMenuProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onValueChange: (value: T) => void;
  triggerClassName?: string;
  contentClassName?: string;
  align?: "start" | "end";
  ariaLabel?: string;
}

/**
 * Minimal shadcn-style dropdown (select-like) with outside-click and Escape handling.
 */
function DropdownMenu<T extends string>({
  value,
  options,
  onValueChange,
  triggerClassName,
  contentClassName,
  align = "start",
  ariaLabel,
}: DropdownMenuProps<T>) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-8 items-center justify-between gap-2 rounded-lg border border-input bg-card px-2.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-taro/20",
          triggerClassName
        )}
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "animate-pop isolate absolute top-full z-[120] mt-1.5 min-w-full overflow-hidden rounded-xl border border-border bg-[#0a0a0a] p-1 opacity-100 shadow-2xl shadow-black/70 backdrop-blur-none",
            align === "end" ? "right-0" : "left-0",
            contentClassName
          )}
          style={{ backgroundColor: "#0a0a0a", opacity: 1 }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  isSelected && "text-foreground"
                )}
              >
                {option.icon && <span className="shrink-0 text-muted-foreground">{option.icon}</span>}
                <span className="flex-1">{option.label}</span>
                {isSelected && <Check className="size-3.5 text-taro" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { DropdownMenu };
