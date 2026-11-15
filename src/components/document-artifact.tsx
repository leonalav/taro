import type { ReactNode } from "react";
import { ArtifactNodes } from "./artifact-nodes";
import "./artifact-sheet.css";

/**
 * Shared geometry for token documents and both plan document types.
 * The sheet borrows the Explorer panel's flat #0b0b0b surface and the
 * artifact reference's monospaced header, index rule and action row.
 */
export function DocumentArtifact({ header, preview, footer, expanded, agentLabel, kind }: { header: ReactNode; preview: ReactNode; footer: ReactNode; expanded?: ReactNode; agentLabel: string; kind: string }) {
  return <div data-document-artifact={kind} className="artifact-sheet animate-pop">
    <ArtifactNodes />
    <div className="artifact-sheet__head">
      <div className="artifact-sheet__kind">{header}</div>
      <div className="artifact-sheet__traffic" aria-hidden="true"><span /><span /><span /></div>
    </div>
    <div className="artifact-sheet__body">{preview}</div>
    <div className="artifact-sheet__foot">
      <span className="artifact-sheet__agent">{agentLabel}</span>
      <div className="artifact-sheet__actions">{footer}</div>
    </div>
    {expanded}
  </div>;
}
