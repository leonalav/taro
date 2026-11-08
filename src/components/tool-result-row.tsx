import { ChevronDown, Code2, FileText, GitBranch, Search, Square, type LucideIcon } from "lucide-react";
import type { ToolResultMessage } from "@/data/phase-two";
import { cn } from "@/utils/cn";

const icons: Record<ToolResultMessage["tool"], LucideIcon> = { LSP: Code2, TaskOutput: FileText, TaskStop: Square, Worktree: GitBranch, ToolSearch: Search };

/** Same compact disclosure geometry as the original Edited file artifact. */
export function ToolResultRow({ message }: { message: ToolResultMessage }) {
  const Icon = icons[message.tool];
  return <details data-tool-result={message.tool} className="group/tool-result animate-pop min-w-0 overflow-hidden rounded-xl border border-border bg-card">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-taro [&::-webkit-details-marker]:hidden">
      <Icon className="size-3.5 shrink-0 text-muted-foreground/60" strokeWidth={1.75} />
      <span className="shrink-0 text-muted-foreground">{message.action}</span>
      <span className="min-w-0 truncate text-foreground/80" title={message.subject}>{message.subject}</span>
      <span className={cn("ml-auto shrink-0 text-[11px]",message.failed ? "text-destructive/80" : message.status === "Not ready" ? "text-muted-foreground" : "text-success/80")}>{message.status}</span>
      <ChevronDown className="size-3 shrink-0 text-muted-foreground transition-transform group-open/tool-result:rotate-180" />
    </summary>
    <pre className={cn("scrollbar-thin max-h-52 overflow-auto border-t border-border bg-[#060606] px-3 py-2 font-mono text-[11.5px] leading-5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",message.failed ? "text-destructive/80" : "text-foreground/80")}>{message.output}</pre>
  </details>;
}
