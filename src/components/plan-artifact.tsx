import { FileText } from "lucide-react";
import type { PlanMessage } from "@/data/phase-two";
import { DocumentArtifact } from "./document-artifact";

export function PlanArtifact({ message, agentLabel, onOpen }: { message: PlanMessage; agentLabel: string; onOpen?: () => void }) {
  return <DocumentArtifact kind={message.kind} agentLabel={agentLabel}
    header={<>
      <FileText className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      <span>{message.kind} · Updated</span>
    </>}
    preview={<div className="artifact-doc">
      <p className="artifact-doc__title" title={message.name}>{message.name}</p>
      <p className="artifact-doc__path" title={message.path}>{message.path}</p>
      <hr className="artifact-doc__rule" />
      <p className="artifact-doc__line"><span aria-hidden="true">01</span>Markdown plan · editable draft</p>
      <p className="artifact-doc__line"><span aria-hidden="true">02</span>Open to edit in the document panel</p>
    </div>}
    footer={<>
      {onOpen
        ? <button type="button" onClick={onOpen} className="artifact-action" data-tone="accent"><FileText aria-hidden="true" />Open</button>
        : <span className="artifact-meta">Document</span>}
    </>}
  />;
}
