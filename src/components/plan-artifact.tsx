import { FileText } from "lucide-react";
import type { PlanMessage } from "@/data/phase-two";
import { DocumentArtifact } from "./document-artifact";

export function PlanArtifact({ message, agentLabel, onOpen }: { message: PlanMessage; agentLabel: string; onOpen?: () => void }) {
  return <DocumentArtifact kind={message.kind} agentLabel={agentLabel}
    header={<span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground">{message.kind.toUpperCase()} · UPDATED</span>}
    preview={<div className="flex h-full min-w-0 items-center gap-3">
      <FileText className="size-8 shrink-0 text-muted-foreground/60" strokeWidth={1.25} />
      <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground/90" title={message.name}>{message.name}</p><p className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground" title={message.path}>{message.path}</p></div>
    </div>}
    footer={<><span className="truncate text-foreground/85">Markdown plan</span><div className="ml-auto flex shrink-0 items-center gap-1">{onOpen && <button type="button" onClick={onOpen} className="rounded-md px-2 py-1 font-medium text-taro transition-colors hover:bg-taro/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-taro">Open</button>}</div></>}
  />;
}
