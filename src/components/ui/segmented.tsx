import * as React from "react";
import { cn } from "@/utils/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Renders the option greyed out and non-interactive. */
  disabled?: boolean;
  disabledHint?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}

/** Geist-style segmented control. */
function Segmented<T extends string>({ value, options, onValueChange, ariaLabel, className }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={option.disabled || undefined}
            title={option.disabled ? option.disabledHint : undefined}
            onClick={() => !option.disabled && onValueChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors [&_svg]:size-3.5",
              active
                ? "bg-accent text-foreground ring-1 ring-inset ring-white/[0.06]"
                : "text-muted-foreground hover:text-foreground",
              option.disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { Segmented };
