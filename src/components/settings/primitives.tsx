import * as React from "react";
import { cn } from "@/utils/cn";

/** Titled group of rows, rendered as a single bordered card (Geist style). */
export function SettingsGroup({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2.5", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-4 px-0.5">
          <div>
            {title && <h3 className="text-[13px] font-medium text-foreground">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}

/** Label + description on the left, control on the right. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  htmlFor?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-14 items-center gap-6 px-4 py-3", className)}>
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[13px] text-foreground">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

/** Small status dot + label. */
export function StatusDot({ tone, children }: { tone: "success" | "warning" | "muted"; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "success" && "bg-success",
          tone === "warning" && "bg-warning",
          tone === "muted" && "bg-muted-foreground/40"
        )}
      />
      {children}
    </span>
  );
}
