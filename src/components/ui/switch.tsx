import { cn } from "@/utils/cn";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}

/** shadcn-style switch. */
function Switch({ checked, onCheckedChange, disabled, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={props["aria-label"]}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-taro/40 disabled:opacity-40",
        checked ? "bg-foreground" : "bg-white/[0.12]",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-4 rounded-full shadow-sm transition-transform duration-150",
          checked ? "translate-x-4 bg-background" : "translate-x-0.5 bg-foreground/80"
        )}
      />
    </button>
  );
}

export { Switch };
