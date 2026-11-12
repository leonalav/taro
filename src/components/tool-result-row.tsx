import { ChevronDown, Code2, FileText, GitBranch, Search, Square, type LucideIcon } from "lucide-react";
import type { ToolResultMessage } from "@/data/phase-two";
import { cn } from "@/utils/cn";
import "./artifact-sheet.css";

const icons: Record<ToolResultMessage["tool"], LucideIcon> = { LSP: Code2, TaskOutput: FileText, TaskStop: Square, Worktree: GitBranch, ToolSearch: Search };

/** Compact disclosure row sharing the artifact sheet's flat surface and mono meta. */
export function ToolResultRow({ message }: { message: ToolResultMessage }) {
  const Icon = icons[message.tool];
  return <details data-tool-result={message.tool} className="artifact-sheet artifact-sheet--compact group/tool-result animate-pop min-w-0">
    <summary className="artifact-row cursor-pointer list-none justify-start gap-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#f2eee6] [&::-webkit-details-marker]:hidden">
      <Icon className="size-3.5 shrink-0 text-[#9a93aa]" strokeWidth={1.75} />
      <span className="shrink-0 text-[#a8a3b3]">{message.action}</span>
      <span className="min-w-0 truncate text-[#e2deea]" title={message.subject}>{message.subject}</span>
      <span className={cn("ml-auto shrink-0 font-mono text-[10px] tracking-wide", message.failed ? "text-[#ff8f9a]" : message.status === "Not ready" ? "text-[#918b9e]" : "text-[#7ee2a8]")}>{message.status}</span>
      <ChevronDown className="size-3 shrink-0 text-[#918b9e] transition-transform group-open/tool-result:rotate-180" aria-hidden="true" />
    </summary>
    <pre className={cn("scrollbar-thin max-h-56 overflow-auto border-t border-[#1f1f25] bg-[#060608] px-3 py-2.5 font-mono text-[11.5px] leading-5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]", message.failed ? "text-[#ff9aa4]" : "text-[#c9c4d4]")}>{message.output}</pre>
  </details>;
}
