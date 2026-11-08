import type { ReactNode } from "react";

/** Shared geometry for token documents and both plan document types. */
export function DocumentArtifact({ header, preview, footer, expanded, agentLabel, kind }: { header: ReactNode; preview: ReactNode; footer: ReactNode; expanded?: ReactNode; agentLabel: string; kind: string }) {
  return <div data-document-artifact={kind} className="animate-pop flex min-w-0 flex-col gap-1.5">
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="flex h-5 items-center gap-2">{header}</div>
      <div className="mt-3 h-[81px] min-w-0">{preview}</div>
      <div className="mt-3 flex h-7 min-w-0 items-center gap-2 text-[13px]">{footer}</div>
      {expanded}
    </div>
    <span className="text-xs text-muted-foreground">{agentLabel}</span>
  </div>;
}
