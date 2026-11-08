import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelledBy?: string;
  className?: string;
  children: React.ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * shadcn-style modal dialog: portal, blurred overlay, Escape to close,
 * focus trap, and focus restoration to the previously focused element.
 */
function Dialog({ open, onOpenChange, labelledBy, className, children }: DialogProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = contentRef.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Let open nested popovers consume Escape first.
        if (node?.querySelector('[aria-haspopup][aria-expanded="true"]')) return;
        e.preventDefault();
        onOpenChange(false);
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div
        aria-hidden="true"
        onMouseDown={() => onOpenChange(false)}
        className="animate-fade absolute inset-0 bg-black/70 backdrop-blur-[2px]"
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "animate-dialog relative overflow-hidden rounded-2xl border border-border bg-[#0a0a0a] shadow-[0_32px_120px_-20px_rgba(0,0,0,0.95)] ring-1 ring-white/[0.04]",
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export { Dialog };
