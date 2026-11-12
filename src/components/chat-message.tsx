import {terminalLogText} from "@/lib/terminal-output";
import {WebResearchRow} from './web-research-row';
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  ShieldCheck,
  MessageSquarePlus,
  LayoutGrid,
  Clock3,
  Copy,
  FileCode,
  FileSearch,
  FolderTree,
  FileText,
  GitBranch,
  GitFork,
  LoaderCircle,
  SlidersHorizontal,
  Monitor,
  Plug,
  RotateCcw,
  Undo2,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  currentUser,
  permissionAllow,
  permissionDeny,
  type ActivityKind,
  type ChatMessage,
  type DiffLine,
  type PermissionChoice,
  type Segment,
  type TokenSwatch,
  type ToolActivity,
} from "@/data/mock";
import { cn } from "@/utils/cn";
import { findColors } from "@/lib/color";
import { annotationSvg } from "@/lib/layout-designer";
import { MentionChip } from "@/components/mention-chip";
import { useSettings } from "@/components/settings/settings-context";
import { editedSegments } from "@/lib/chat-history";
import { ToolResultRow } from "@/components/tool-result-row";
import { PlanArtifact } from "@/components/plan-artifact";
import { DocumentArtifact } from "@/components/document-artifact";
import { migrateProfessionalMessage } from "@/data/phase-two";
import ThoughtLine from "@/components/thought-line";
import { ThoughtArtifact } from "@/components/thought-artifact";
import { FoundationRow, FoundationStatusIcon, foundationStateLabels } from "@/components/foundation-row";
import { aggregateActivityState, normalizeActivityState } from "@/lib/foundation-events";
import "./artifact-sheet.css";

interface MessageItemProps {
  message: ChatMessage;
  agentLabel: (id: string) => string;
  onRevert: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onEditMessage?: (messageId: string, segments: Segment[]) => void;
  busy?: boolean;
  editRequestToken?: number;
  revertEnabled?: boolean;
  retryEnabled?: boolean;
  onDecide?: (messageId: string, choice: PermissionChoice | null) => void;
  onOpenDoc?: (messageId: string) => void;
  docForMessage?: (messageId: string) => string | undefined;
  onAnswerQuestion?: (messageId: string, questionId: string, answer: number | null, action: "answer" | "skip" | "decline") => void;
  onAcceptSkeletal?: (messageId: string) => void;
  onEditSkeletal?: (message: Extract<ChatMessage, { role: "skeletal" }>) => void;
}

export function MessageItem({
  message,
  agentLabel,
  onRevert,
  onRetry,
  onEditMessage,
  busy,
  editRequestToken,
  revertEnabled=true,
  retryEnabled=true,
  onDecide,
  onOpenDoc,
  docForMessage,
  onAnswerQuestion,
  onAcceptSkeletal,
  onEditSkeletal,
}: MessageItemProps) {
  const [copied, setCopied] = React.useState(false);
  const {reduceMotion}=useSettings().appearance;
  const [editing,setEditing] = React.useState(false);
  const [draft,setDraft] = React.useState("");
  const [keptAttachments,setKeptAttachments] = React.useState<string[]>([]);
  React.useEffect(()=>setEditing(false),[message.id]);
  const beginEdit=()=>{
    if(message.role!=="user" || !onEditMessage || busy)return;
    setDraft(message.segments.filter(segment=>segment.type==="text").map(segment=>segment.text??"").join(""));
    setKeptAttachments(message.segments.filter(segment=>segment.type==="attachment"&&segment.attachment).map(segment=>segment.attachment!.id));
    setEditing(true);
  };
  const sendEdit=()=>{
    if(message.role!=="user" || !onEditMessage)return;
    const next=editedSegments(message.segments,draft,keptAttachments);
    if(next.length)onEditMessage(message.id,next);
  };
  React.useEffect(()=>{if(editRequestToken)beginEdit();},[editRequestToken]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };

  switch (message.role) {
    case "thought":
      return <div className="animate-pop flex min-w-0 items-start gap-3"><Avatar initials={message.agentId==="planner"?"PL":agentLabel(message.agentId).slice(0,2).toUpperCase()} size="md" tone="taro" className="mt-0.5"/><div className="min-w-0 flex-1 pt-1"><ThoughtArtifact message={message}/></div></div>;
    case "professional-tool":
      return <>{migrateProfessionalMessage(message).map(item=><MessageItem key={item.id} message={item} agentLabel={agentLabel} onRevert={onRevert} onOpenDoc={onOpenDoc} docForMessage={docForMessage}/>)}</>;
    case "tool-result":
      return <ToolResultRow message={message} />;
    case "plan":
      return <PlanArtifact message={message} agentLabel={agentLabel(message.agentId)} onOpen={onOpenDoc ? ()=>onOpenDoc(message.id) : undefined} />;
    case "user": {
      const messageText=message.segments.filter(segment=>segment.type==="text").map(segment=>segment.text??"").join(" ").trim();
      return (
        <div className="animate-pop group/message flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-[#2b2b33] bg-[#141419] font-mono text-[10px] font-medium tracking-tight text-[#d8d2e2]">{currentUser.initials}</span>
          <div className="min-w-0 flex-1">
            {editing ? <div className="w-full rounded-2xl border border-taro/50 bg-card p-3 shadow-[0_16px_36px_-20px_rgba(0,0,0,0.8)]">
              <textarea autoFocus aria-label="Edit message text" value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Escape")setEditing(false);if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();sendEdit();}}} rows={Math.max(2,Math.min(8,draft.split("\n").length))} className="max-h-48 min-h-16 w-full resize-y bg-transparent text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground" placeholder="Edit your message" />
              {message.segments.some(segment=>segment.type==="chip"&&segment.chip) && <div className="mt-2 flex flex-wrap gap-1.5">{message.segments.filter(segment=>segment.type==="chip"&&segment.chip).map((segment,index)=><MentionChip key={`${segment.chip!.id}-${index}`} chip={segment.chip!}/>)}</div>}
              {message.segments.some(segment=>segment.type==="attachment"&&segment.attachment&&keptAttachments.includes(segment.attachment.id)) && <div className="mt-2 flex flex-wrap gap-2">{message.segments.filter(segment=>segment.type==="attachment"&&segment.attachment&&keptAttachments.includes(segment.attachment.id)).map(segment=><div key={segment.attachment!.id} className="relative overflow-hidden rounded-lg border border-border bg-background">{segment.attachment!.mime.startsWith("image/")&&segment.attachment!.dataUrl?<img src={segment.attachment!.dataUrl} alt={segment.attachment!.name} className="size-20 object-cover"/>:<span className="block max-w-32 truncate px-2 py-3 text-xs">{segment.attachment!.name}</span>}<button type="button" aria-label={`Remove ${segment.attachment!.name}`} onClick={()=>setKeptAttachments(ids=>ids.filter(id=>id!==segment.attachment!.id))} className="absolute right-1 top-1 rounded-full bg-black/75 p-1 text-white"><X className="size-3"/></button></div>)}</div>}
              <div className="mt-3 flex items-center justify-end gap-2"><span className="mr-auto text-[11px] text-muted-foreground">Ctrl/⌘ Enter to send</span><Button size="sm" variant="secondary" onClick={()=>setEditing(false)}>Cancel</Button><Button size="sm" aria-label="Send edited message" onClick={sendEdit} disabled={!editedSegments(message.segments,draft,keptAttachments).length}>Send</Button></div>
            </div> : <div role={onEditMessage?"button":undefined} tabIndex={onEditMessage?0:undefined} aria-label={onEditMessage?`Edit message: ${messageText.slice(0,180)}`:undefined} title={onEditMessage?"Edit message":undefined} aria-disabled={busy||undefined} onClick={event=>{if((event.target as HTMLElement).closest("a,button"))return;beginEdit();}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();beginEdit();}}} className={cn("artifact-message inline-block max-w-full px-4 py-3 font-mono text-[13px] leading-[1.85] font-normal",onEditMessage&&!busy&&"cursor-text transition-colors hover:border-[#b9a9cd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b4478] focus-visible:ring-offset-2 focus-visible:ring-offset-black")}>
              {message.segments.some(s=>s.type==="chip" || (s.type==="text" && s.text)) && <p className="whitespace-pre-wrap break-words">{message.segments.map((segment, i) =>
                segment.type === "attachment" ? null :
                segment.type === "chip" && segment.chip ? (
                  <MentionChip key={i} chip={segment.chip} className="translate-y-[-1px]" />
                ) : (
                  <span key={i}>{segment.text}</span>
                )
              )}</p>}
              {message.segments.some(s=>s.type==="attachment") && <div className={cn("flex flex-wrap gap-2",message.segments.some(s=>s.type==="chip" || (s.type==="text" && s.text)) && "mt-2")}>{message.segments.filter(s=>s.type==="attachment"&&s.attachment).map(s=>{const file=s.attachment!;return <a key={file.id} href={file.dataUrl} download={file.name} title={file.name} className="block overflow-hidden rounded-lg border border-[#3a3a44] bg-[#141419]">{file.mime.startsWith("image/") && file.dataUrl?<img src={file.dataUrl} alt={file.name} className="size-28 object-cover"/>:<div className="flex h-28 w-36 flex-col items-center justify-center gap-2 p-2"><FileText className="size-6 text-[#a8a3b3]"/><span className="w-full truncate text-center font-mono text-[10px] font-normal text-[#d6d1e0]">{file.name}</span></div>}</a>})}</div>}
            </div>}
            {!editing&&<div className="mt-1"><MessageActions onRetry={onRetry?()=>onRetry(message.id):undefined} onRevert={() => onRevert(message.id)} busy={busy} retryEnabled={retryEnabled} revertEnabled={revertEnabled} /></div>}
          </div>
        </div>
      );
    }

    case "agent":
      if(!message.text&&!message.trace?.length)return null;
      return (
        <div className="animate-pop group/message flex items-start gap-3">
          <Avatar initials={message.agentId === "planner" ? "PL" : agentLabel(message.agentId).slice(0, 2).toUpperCase()} size="md" tone="taro" className="mt-0.5" />
          {message.text === "" && message.trace?.includes("Generating response") ? (
            <div className="min-w-0 flex-1 pt-1"><ThoughtLine working={false} glyph="dot" doneLabel="Interrupted" showTimer={false} fontSize={12} color="var(--artifact-muted, #a8a3b3)" reduceMotion={reduceMotion} steps={["The previous response was interrupted"]}/></div>
          ) : (
          <div className="min-w-0 flex-1 flex flex-col gap-2.5">
            {message.trace && <ThoughtLine working={false} glyph="dot" elapsed={(message.durationMs??0)/1000} steps={message.trace} fontSize={12} color="var(--artifact-muted, #a8a3b3)" reduceMotion={reduceMotion} />}
            <span className="flex min-w-0 items-center gap-2 artifact-meta"><span className="artifact-dot" aria-hidden="true" />{agentLabel(message.agentId)}</span>
            <div data-agent-reply="true" className="agent-reply min-w-0">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{
                a: ({children,href}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
              }}>{message.text}</ReactMarkdown>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] pt-1.5">
              <MessageActions copied={copied} onCopy={() => void copyText(message.text)} onRetry={onRetry?()=>onRetry(message.id):undefined} onRevert={() => onRevert(message.id)} busy={busy} retryEnabled={retryEnabled} revertEnabled={revertEnabled} />
            </div>
          </div>
          )}
        </div>
      );

    case "permission":
      return (
        <PermissionCard
          agentName={agentLabel(message.agentId)}
          mcp={message.mcp}
          tool={message.tool}
          live={message.live}
          onceOnly={message.onceOnly}
          decision={message.decision}
          onDecide={(choice) => onDecide?.(message.id, choice)}
        />
      );

    case "activity-group":
      return <ActivityGroup summary={message.summary} activities={message.activities} startedAt={message.startedAt} gallery={message.foundationGallery} onOpenDocument={onOpenDoc?()=>onOpenDoc(message.id):undefined} />;

    case "subagent":
      return <SubagentCard message={message}/>;

    case "event":
      return (
        <div className="animate-pop flex items-center gap-3 font-mono text-[10.5px] tracking-wide text-[#918b9e]">
          <span className="h-px flex-1 bg-[#1f1f25]" aria-hidden="true" />
          <span className="flex items-center gap-1.5">
            <CircleCheck className="size-3.5 text-[#7ee2a8]" strokeWidth={2} aria-hidden="true" />
            {message.text}
          </span>
          <span className="h-px flex-1 bg-[#1f1f25]" aria-hidden="true" />
        </div>
      );

    case "tokens":
      return (
        <TokensCard
          tokens={message.tokens}
          contrastFrom={message.contrastFrom}
          contrastTo={message.contrastTo}
          agentLabel={agentLabel(message.agentId)}
          docText={docForMessage?.(message.id)}
          onOpen={onOpenDoc ? () => onOpenDoc(message.id) : undefined}
        />
      );

    case "tool":
      return (
        <ToolCard
          action={message.action}
          file={message.file}
          added={message.added}
          removed={message.removed}
          diff={message.diff}
        />
      );

    case "questions":
      return <QuestionsCard message={message} agentName={agentLabel(message.agentId)} onAnswer={onAnswerQuestion} />;

    case "skeletal":
      return (
        <SkeletalCard
          message={message}
          agentName={agentLabel(message.agentId)}
          onAccept={onAcceptSkeletal}
          onEdit={onEditSkeletal ? () => onEditSkeletal(message) : undefined}
        />
      );
  }
}

/* ------------------------------------------------------------------
 * MCP permission request
 * ------------------------------------------------------------------ */

function PermissionCard({
  agentName,
  mcp,
  tool,
  live,
  onceOnly,
  decision,
  onDecide,
}: {
  agentName: string;
  mcp: string;
  tool: string;
  live?: boolean;
  onceOnly?: boolean;
  decision?: PermissionChoice;
  onDecide: (choice: PermissionChoice | null) => void;
}) {
  const [expanded, setExpanded] = React.useState<"allow" | "deny" | null>(null);
  const initials = agentName.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "AI";

  return (
    <div data-permission-card="true" className="animate-pop artifact-surface overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <Avatar initials={initials} size="md" tone="taro" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p data-permission-title="true" className="font-mono text-[13px] leading-6 text-[#e9e7ee]">
            Allow <span className="font-semibold">{agentName}</span> to use{" "}
            <span className="font-semibold">{mcp}</span>{" "}
            <span className="text-[#918b9e]">:</span>{" "}
            <code className="rounded border border-[#2b2b33] bg-[#15151a] px-1.5 py-0.5 font-mono text-[11.5px] text-[#e6dcf8]">{tool}</code>
            <span className="text-[#918b9e]">?</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] leading-5 text-[#a8a3b3]">
            <ShieldCheck className="size-3.5 shrink-0 text-taro/80" />
            {mcp === "workspace tool" ? "This action needs your approval before it runs." : "This agent is asking for permission before calling an external tool."}
          </p>
        </div>
      </div>

      {decision ? (
        <div className="flex items-center gap-2.5 border-t border-[#1f1f25] bg-white/[0.02] px-4 py-3">
          {decision.allowed ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-success/15">
              <Check className="size-3 text-success" strokeWidth={3} />
            </span>
          ) : (
            <span className="flex size-5 items-center justify-center rounded-full bg-destructive/15">
              <X className="size-3 text-destructive" strokeWidth={3} />
            </span>
          )}
          <span className="font-mono text-[12px] text-[#e9e7ee]">{decision.label}</span>
          {!live && mcp!=="workspace tool" && <button
            type="button"
            onClick={() => onDecide(null)}
            className="ml-auto font-mono text-[10.5px] text-[#a8a3b3] transition-colors hover:text-[#f7f5fb]"
          >
            Change decision
          </button>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 border-t border-[#1f1f25] p-3">
          <PermissionGroup
            tone="allow"
            primary={mcp==="workspace tool"?"Allow once":"Allow tool"}
            defaultChoice={permissionAllow[0]}
            options={onceOnly?[]:mcp==="workspace tool"?permissionAllow.filter(choice=>choice.target==="tool"):permissionAllow}
            expanded={expanded === "allow"}
            onToggle={() => setExpanded((cur) => (cur === "allow" ? null : "allow"))}
            onChoose={onDecide}
          />
          <PermissionGroup
            tone="deny"
            primary={mcp==="workspace tool"?"Deny":"Deny tool"}
            defaultChoice={permissionDeny[0]}
            options={onceOnly?[]:mcp==="workspace tool"?permissionDeny.filter(choice=>choice.target==="tool"):permissionDeny}
            expanded={expanded === "deny"}
            onToggle={() => setExpanded((cur) => (cur === "deny" ? null : "deny"))}
            onChoose={onDecide}
          />
        </div>
      )}
    </div>
  );
}

function PermissionGroup({
  tone,
  primary,
  defaultChoice,
  options,
  expanded,
  onToggle,
  onChoose,
}: {
  tone: "allow" | "deny";
  primary: string;
  defaultChoice: PermissionChoice;
  options: PermissionChoice[];
  expanded: boolean;
  onToggle: () => void;
  onChoose: (choice: PermissionChoice) => void;
}) {
  const isAllow = tone === "allow";

  return (
    <div>
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => onChoose(defaultChoice)}
          className={cn(
            "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg font-mono text-[11px] font-medium transition-colors",
            isAllow
              ? "bg-[#ededed] text-[#0a0a0a] hover:bg-white"
              : "border border-[#2b2b33] bg-[#141419] text-[#e9e7ee] hover:bg-[#1c1c22]"
          )}
        >
          {isAllow ? <Check className="size-3.5" strokeWidth={2.5} /> : <X className="size-3.5" strokeWidth={2.5} />}
          {primary}
        </button>
        {options.length>0&&<button
          type="button"
          aria-label={`More ${primary.toLowerCase()} options`}
          aria-expanded={expanded}
          onClick={onToggle}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            isAllow
              ? "bg-[#ededed] text-[#0a0a0a] hover:bg-white"
              : "border border-[#2b2b33] bg-[#141419] text-[#e9e7ee] hover:bg-[#1c1c22]"
          )}
        >
          <ChevronRight className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-90")} />
        </button>}
      </div>

      {expanded && (
        <div className="animate-pop mt-1 rounded-xl border border-[#1f1f25] bg-[#08080b] p-1">
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onChoose(option)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                isAllow ? "text-muted-foreground hover:bg-accent hover:text-foreground" : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              )}
            >
              <span
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-full",
                  isAllow ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                )}
              >
                {isAllow ? <Check className="size-2.5" strokeWidth={3} /> : <X className="size-2.5" strokeWidth={3} />}
              </span>
              <span className="flex-1">{option.label}</span>
              <span aria-hidden="true" className="shrink-0 text-[10px] text-muted-foreground/70">
                {option.target === "mcp" ? "whole MCP" : "one tool"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.max(1, Math.round(ms))}ms`;
}

function MessageActions({
  copied,
  onCopy,
  onRetry,
  onRevert,
  busy,
  retryEnabled=true,
  revertEnabled=true,
}: {
  copied?: boolean;
  onCopy?: () => void;
  onRetry?: () => void;
  onRevert: () => void;
  busy?: boolean;
  retryEnabled?: boolean;
  revertEnabled?: boolean;
}) {
  return (
    <div role="group" aria-label="Message actions" className="flex shrink-0 items-center gap-0.5">
      {onCopy && (
        <button
          type="button"
          aria-label={copied ? "Copied response" : "Copy response"}
          title={copied ? "Copied" : "Copy response"}
          onClick={onCopy}
          className="artifact-action"
        >
          {copied ? <Check className="size-3.5 text-[#7ee2a8]" aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </button>
      )}
      {onRetry&&<button type="button" aria-label="Retry message" title="Retry from this message" disabled={busy||!retryEnabled} onClick={onRetry} className="artifact-action"><RotateCcw aria-hidden="true"/>Retry</button>}
      <button type="button" aria-label="Revert to edit message" title="Remove agent output and edit the user message" disabled={busy||!revertEnabled} onClick={onRevert} className="artifact-action"><Undo2 aria-hidden="true"/>Revert</button>
    </div>
  );
}

const activityIcons: Record<ActivityKind, LucideIcon> = {
  "file-read": FileText,
  "file-list": FolderTree,
  "file-edit": FileCode,
  terminal: Terminal,
  search: FileSearch,
  'web-search': FileSearch,
  'web-fetch': FileText,
  skill: Brain,
  mcp: GitBranch,
  plugin: Plug,
  browser: Monitor,
  foundation: ShieldCheck,
};

function SubagentCard({message}:{message:Extract<ChatMessage,{role:"subagent"}>}) {
  const running=message.status==="running";
  return <div data-subagent-artifact={message.childId} className="animate-pop artifact-surface p-4">
    <div className="flex items-start gap-3">
      <Avatar initials={message.subagentType.slice(0,2).toUpperCase()} size="md" tone="taro"/>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><GitFork className="size-3.5 text-[#c9a8ff]"/><span className="font-mono text-[12px] font-semibold tracking-tight text-[#f7f5fb]">Deploy subagent</span><span className="artifact-label text-[#c9a8ff]">{message.subagentType}</span><span className={cn("ml-auto inline-flex items-center gap-1 font-mono text-[10px] tracking-wide",running?"text-[#c9a8ff]":message.status==="failed"?"text-[#ff8f9a]":message.status==="stopped"?"text-[#918b9e]":"text-[#7ee2a8]")}>{running?<LoaderCircle className="size-3 animate-spin"/>:message.status==="failed"?<CircleX className="size-3"/>:<CircleCheck className="size-3"/>}{running?"Running":message.status==="failed"?"Failed":message.status==="stopped"?"Stopped":"Completed"}</span></div>
        <p className="mt-1.5 font-mono text-[11.5px] leading-6 text-[#d6d1e0]">{message.description}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5 font-mono text-[9.5px] tracking-wide text-[#a8a3b3]"><span className="rounded border border-[#2b2b33] bg-[#15151a] px-1.5 py-0.5">{message.childId}</span>{message.runInBackground&&<span className="rounded border border-[#2b2b33] px-1.5 py-0.5">Background</span>}{message.isolation==="worktree"&&<span className="rounded border border-[#2b2b33] px-1.5 py-0.5">Worktree</span>}{message.model&&<span className="rounded border border-[#2b2b33] px-1.5 py-0.5">{message.model} model</span>}</div>
      </div>
    </div>
    <details className="mt-3 font-mono text-[11px]"><summary className="cursor-pointer rounded text-[#a8a3b3] hover:text-[#f7f5fb] focus-visible:outline-2 focus-visible:outline-[#dcc6ff]">View task brief</summary><p className="mt-2 rounded-lg border border-[#1f1f25] bg-[#08080b] px-3 py-2 leading-6 text-[#c9c4d4]">{message.prompt}</p></details>
    {message.activities.length>0&&<div className="mt-3"><ActivityGroup summary={`${message.activities.length} tool calls by ${message.subagentType}`} activities={message.activities}/></div>}
    {message.result&&<div className="mt-3 border-t border-[#1f1f25] pt-3"><p className="artifact-label">Result</p><p className="mt-1.5 font-mono text-[11px] leading-6 text-[#d6d1e0]">{message.result}</p></div>}
  </div>;
}

function ActivityGroup({
  summary,
  activities,
  startedAt,
  gallery,
  onOpenDocument,
}: {
  summary: string;
  activities: ToolActivity[];
  startedAt?: number;
  gallery?: ToolActivity[];
  onOpenDocument?:()=>void;
}) {
  const group=aggregateActivityState(activities.map(a=>a.foundation?.state??a.status));
  const isRunning = group.state==="running";
  const isFoundation=!!gallery||activities.some(a=>a.foundation);
  const {reduceMotion}=useSettings().appearance;
  const [open,setOpen]=React.useState(isRunning||group.actionable);
  const userToggled=React.useRef(false);
  const previousActionable=React.useRef(group.actionable);
  React.useEffect(()=>{
    if(!userToggled.current&&group.actionable&&!previousActionable.current)setOpen(true);
    previousActionable.current=group.actionable;
  },[group.actionable]);
  const bodyId=React.useId();
  const elapsed = startedAt !== undefined && isRunning ? Date.now() - startedAt : undefined;

  return (
    <div className="artifact-sheet artifact-sheet--compact group/activity min-w-0 animate-pop">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={()=>{userToggled.current=true;setOpen(v=>!v);}} className="artifact-row min-h-[38px] cursor-pointer px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#dcc6ff]">
        <FoundationStatusIcon state={group.state} reduceMotion={reduceMotion}/>
        <span className="min-w-0 flex-1 truncate text-foreground/80">{summary}</span>
        {isFoundation&&activities.length>0&&<span className="text-[10px] text-muted-foreground">{foundationStateLabels[group.state]}</span>}
        {elapsed !== undefined && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatDuration(elapsed)}</span>}
        {group.hasFailure&&["running","queued"].includes(group.state)&&<span className="text-[10px] text-destructive">Includes failures</span>}
        <span className="shrink-0 text-[10px] text-muted-foreground">{gallery?.length??activities.length} {isFoundation?(gallery?.length??activities.length)===1?"activity":"activities":activities.length===1?"tool":"tools"}</span>
        <ChevronDown className={cn("size-3.5 shrink-0",open&&"rotate-180")} />
      </button>

      <div id={bodyId} hidden={!open} className="min-w-0 border-t border-[#1f1f25] px-3 py-1.5 font-mono text-[11px]">
        {gallery&&<FoundationGallery activities={gallery}/>}
        {activities.map((activity) => {
          if(activity.web)return <WebResearchRow key={activity.id} activity={activity}/>;
          if(activity.foundation)return <FoundationRow key={activity.id} operation={activity.foundation} onOpenDocument={activity.foundation.kind==="design-plan"?onOpenDocument:undefined}/>;
          const Icon = activityIcons[activity.kind];
          return (
            <div key={activity.id} className="flex items-start gap-2.5 py-1.5 text-[11px]">
              <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                <FoundationStatusIcon state={normalizeActivityState(activity.status)} reduceMotion={reduceMotion}/>
              </div>
              <ActivityIcon activity={activity} Icon={Icon} />
              <div className="min-w-0 flex-1">
                <p className={cn("leading-relaxed", activity.status === "failed" ? "text-[#ff8f9a]" : "text-[#d6d1e0]")}>
                  {activity.label}
                  <span className={cn("ml-1.5",activity.status==="failed"?"text-destructive/70":activity.status==="done"||activity.status==="succeeded"?"text-success/80":"text-muted-foreground")}>{activity.status==="done"?"Done":foundationStateLabels[normalizeActivityState(activity.status)]}</span>
                </p>
                {activity.detail && <p className="mt-0.5 text-[10.5px] leading-relaxed text-[#918b9e]">{activity.detail}</p>}
                {activity.output && <details className="mt-1.5"><summary className="cursor-pointer text-[11px] text-taro">View result</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-background p-2 font-mono text-[11px] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{activity.kind==="terminal"?terminalLogText(activity.output):activity.output}</pre></details>}
                {activity.imageDataUrl && <img src={activity.imageDataUrl} alt={activity.label} className="mt-2 max-h-48 rounded border border-border object-contain"/>}
                {activity.errorTrace && (
                  <pre className="scrollbar-thin mt-1.5 max-h-24 overflow-auto rounded-md border border-destructive/20 bg-[#080808] px-2 py-1.5 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-destructive/75">{activity.errorTrace}</pre>
                )}
                {activity.edit && <InlineEdit edit={activity.edit} />}
              </div>
              {activity.durationMs !== undefined && (
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground/70">
                  <Clock3 className="size-3" />{formatDuration(activity.durationMs)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FoundationGallery({activities}:{activities:ToolActivity[]}) {
  const families=[...new Set(activities.flatMap(a=>a.foundation?[a.foundation.kind]:[]))];
  return <><p className="py-2 text-[11px] text-muted-foreground">Sample data · Explore outcomes without changing files or running commands.</p>{families.map(kind=><details key={kind} className="min-w-0 border-t border-border py-1.5"><summary className="cursor-pointer rounded-sm py-1 text-xs text-foreground/85 focus-visible:outline-2 focus-visible:outline-taro">{kind.replace(/-/g," ")} · {activities.filter(a=>a.foundation?.kind===kind).length} states</summary><div className="min-w-0">{activities.filter(a=>a.foundation?.kind===kind).map(a=><FoundationRow key={a.id} operation={a.foundation!}/>)}</div></details>)}</>;
}

/** Shared diff body used by the Edited artifact and grouped file-edit rows. */
function DiffLines({ diff, className }: { diff: DiffLine[]; className?: string }) {
  return (
    <div className={cn("scrollbar-none max-h-36 overflow-auto bg-[#060606] py-2 font-mono text-[11.5px] leading-5", className)}>
      {diff.map((line, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-3 px-3",
            line.kind === "add" && "bg-success/[0.06] text-success/70",
            line.kind === "remove" && "bg-destructive/[0.06] text-destructive/70",
            line.kind === "context" && "text-muted-foreground/50"
          )}
        >
          <span className="w-2.5 select-none text-center opacity-70">
            {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
          </span>
          <span className="whitespace-pre">{line.text}</span>
        </div>
      ))}
    </div>
  );
}

/** A compact "Edited file  +N −M ⌄" disclosure inside a grouped tool row. */
function InlineEdit({ edit }: { edit: NonNullable<ToolActivity["edit"]> }) {
  const { showCodeByDefault } = useSettings().appearance;
  const [open, setOpen] = React.useState(showCodeByDefault);
  return (
    <div data-inline-edit={edit.file} className="mt-1.5 overflow-hidden rounded-md border border-[#24242b] bg-[#0b0b0b]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.02]"
      >
        <FileCode className="size-3 text-muted-foreground/60" strokeWidth={1.75} />
        <span className="text-muted-foreground">Edited</span>
        <span className="truncate text-foreground/80">{edit.file}</span>
        <span className="ml-auto font-mono text-[10px] text-success/80">+{edit.added}</span>
        <span className="font-mono text-[10px] text-destructive/80">−{edit.removed}</span>
        <ChevronDown className={cn("size-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <DiffLines diff={edit.diff} className="max-h-28 border-t border-[#1f1f25] text-[11px]" />}
    </div>
  );
}

function ActivityIcon({ activity, Icon }: { activity: ToolActivity; Icon: LucideIcon }) {
  if (activity.kind === "mcp" && /github/i.test(activity.label)) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-label="GitHub" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/80">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    );
  }
  return <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/80" />;
}

/** Design tokens card: the design artifact is the hero, not the code. */
function TokensCard({
  tokens,
  contrastFrom,
  contrastTo,
  agentLabel,
  docText,
  onOpen,
}: {
  tokens: TokenSwatch[];
  contrastFrom: string;
  contrastTo: string;
  agentLabel: string;
  docText?: string;
  onOpen?: () => void;
}) {
  const { showCodeByDefault } = useSettings().appearance;
  const [showDiff, setShowDiff] = React.useState(showCodeByDefault);

  // The first N colors in the design doc are the source of truth for the
  // swatches; the names stay attached to their slot.
  const docColors = docText ? findColors(docText).map((o) => o.hex) : [];
  const swatches = tokens.map((token, i) => ({
    name: token.name,
    hex: docColors[i] ?? token.hex,
  }));

  return (
    <div data-tokens-card="true">
      <DocumentArtifact kind="Design Tokens" agentLabel={agentLabel} header={<>
          <span>DESIGN TOKENS · UPDATED</span>
          <Badge variant="success" className="ml-auto border-[#2f6b45] bg-[#12291c] font-mono text-[9.5px] tracking-[0.08em] text-[#7ee2a8]">
            AA PASS
          </Badge>
      </>} preview={<div className="grid grid-cols-5 gap-2">
          {swatches.map((token) => (
            <div key={token.name} className="min-w-0">
              <div
                className="h-11 rounded-md border border-white/15"
                style={{ backgroundColor: token.hex }}
              />
              <p className="mt-2 truncate font-mono text-[10.5px] text-[#e2deea]">{token.name}</p>
              <p className="truncate font-mono text-[10px] text-[#918b9e]">{token.hex}</p>
            </div>
          ))}
        </div>} footer={<>
          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[#c3bccd]">
            Contrast fixed: ember CTA{" "}
            <span className="text-[#918b9e]">
              {contrastFrom} → {contrastTo}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {onOpen && (
              <button
                type="button"
                onClick={onOpen}
                className="artifact-action"
                data-tone="accent"
              >
                Open
              </button>
            )}
            <button
              type="button"
              aria-expanded={showDiff}
              onClick={() => setShowDiff((s) => !s)}
              className="artifact-action"
            >
              View diff
            </button>
          </div>
        </>} expanded={showDiff && (
          <div className="animate-pop border-t border-[#1f1f25] bg-[#060608] px-3.5 py-2.5 font-mono text-[11px] leading-5">
            <p className="text-destructive/70">- --ember: #ff7a1a;</p>
            <p className="text-success/80">+ --ember: #ff4d00;</p>
            <p className="text-success/80">+ --ember-ink: #431407;</p>
          </div>
        )}/>
    </div>
  );
}

/** Code is present but deliberately recessive: small, muted, low-contrast. */
function ToolCard({
  action,
  file,
  added,
  removed,
  diff,
}: {
  action: string;
  file: string;
  added: number;
  removed: number;
  diff: DiffLine[];
}) {
  const { showCodeByDefault } = useSettings().appearance;
  const [open, setOpen] = React.useState(showCodeByDefault);

  React.useEffect(() => setOpen(showCodeByDefault), [showCodeByDefault]);

  return (
    <div className="artifact-sheet artifact-sheet--compact animate-pop">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="artifact-row px-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#dcc6ff]"
      >
        <FileCode className="size-3.5 text-muted-foreground/60" strokeWidth={1.75} />
        <span className="text-muted-foreground">{action}</span>
        <span className="text-foreground/80">{file}</span>
        <span className="ml-auto font-mono text-[11px] text-success/80">+{added}</span>
        <span className="font-mono text-[11px] text-destructive/80">−{removed}</span>
        <svg
          viewBox="0 0 24 24"
          className={cn("size-3 text-muted-foreground transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <DiffLines diff={diff} className="border-t border-[#1f1f25]" />}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Doc comment artifact:  💬 Comment · L25–34
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
 * Questions artifact — "Question x of y" with A/B/C/D options
 * ------------------------------------------------------------------ */

function QuestionsCard({
  message,
  agentName,
  onAnswer,
}: {
  message: Extract<ChatMessage, { role: "questions" }>;
  agentName: string;
  onAnswer?: (messageId: string, questionId: string, answer: number | null, action: "answer" | "skip" | "decline") => void;
}) {
  const [index, setIndex] = React.useState(0);
  const [declined, setDeclined] = React.useState(false);
  const q = message.questions[index];
  const total = message.questions.length;

  if (declined || !q) {
    return (
      <div className="animate-pop artifact-surface flex items-center gap-2.5 px-3 py-2.5 font-mono text-[11.5px] text-[#a8a3b3]">
        <MessageSquarePlus className="size-3.5 shrink-0 text-taro/70" />
        Questions closed — the agent will proceed with sensible defaults.
      </div>
    );
  }

  const answered = q.answer !== undefined && q.answer !== null;
  const done = index === total - 1 && answered;

  return (
    <div data-questions-card="true" className="animate-pop artifact-surface p-4">
      <div className="flex items-center gap-2">
        <MessageSquarePlus className="size-3.5 text-taro" />
        <span className="artifact-label">Questions</span>
        <span data-question-progress="true" className="ml-auto font-mono text-[10px] text-[#918b9e] tabular-nums">
          Question {index + 1} of {total}
        </span>
      </div>
      <p className="mt-2.5 font-mono text-[12.5px] leading-6 text-[#e9e7ee]">{q.prompt}</p>

      <div className="mt-3 flex flex-col gap-1.5">
        {q.options.map((opt, i) => {
          const chosen = q.answer === i;
          const letter = String.fromCharCode(65 + i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                onAnswer?.(message.id, q.id, i, "answer");
                // Advance to the next question after a moment.
                if (index < total - 1) window.setTimeout(() => setIndex((n) => Math.min(n + 1, total - 1)), 420);
              }}
              aria-pressed={chosen}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-[13px] transition-colors",
                chosen
                  ? "border-[#6b5486] bg-[#a78bfa19] text-[#f7f5fb]"
                  : "border-[#24242b] text-[#ded9e7] hover:border-[#3a3a44] hover:bg-white/[0.03]"
              )}
            >
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border font-mono text-[10px]", chosen ? "border-[#8a68b1] bg-[#a78bfa] text-[#1a1026]" : "border-[#2b2b33] bg-[#15151a] text-[#a8a3b3]")}>
                {letter}
              </span>
              <span className="min-w-0 flex-1">{opt}</span>
              {chosen && <Check className="size-3.5 shrink-0 text-taro" strokeWidth={2.5} />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onAnswer?.(message.id, q.id, null, "skip");
            if (index < total - 1) setIndex((n) => n + 1);
          }}
          className="artifact-action"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => { setDeclined(true); onAnswer?.(message.id, q.id, null, "decline"); }}
          className="artifact-action"
        >
          Decline to answer
        </button>
        <span className="ml-auto font-mono text-[10px] text-[#918b9e]">
          {answered ? "Answer recorded" : "Pick one option"} · {agentName}
        </span>
      </div>
      {done && <p className="mt-2 font-mono text-[10px] text-[#7ee2a8]">All questions answered.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Skeletal design proposal (loading + ready)
 * ------------------------------------------------------------------ */

function SkeletalPreview({
  variant,
  layers,
  width,
  height,
  annotations,
}: {
  variant: "hero" | "cards" | "dashboard";
  layers?: Extract<ChatMessage, { role: "skeletal" }>["layers"];
  width?: number;
  height?: number;
  annotations?: Extract<ChatMessage, { role: "skeletal" }>["annotations"];
}) {
  const stageWidth = width ?? 520;
  const stageHeight = height ?? 330;
  const visibleLayers = layers?.length ? [...layers].sort((a, b) => a.z - b.z) : [];

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-border bg-[#0b0b0d]" style={{ aspectRatio: `${stageWidth} / ${stageHeight}` }}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:12px_12px]" />
      {layers ? visibleLayers.map((layer) => {
        if (layer.hidden) return null;
        if (layer.kind === "background") return (
          <div key={layer.id} className="absolute inset-0" style={{ zIndex: layer.z, opacity: layer.opacity / 100 }}>
            {layer.mediaPoster && <img src={layer.mediaPoster} alt="" className="size-full object-cover" />}
            {!layer.mediaPoster && layer.mediaUrl && <video src={layer.mediaUrl} muted loop autoPlay playsInline className="size-full object-cover" />}
            <div className="absolute inset-0 bg-black/20" />
          </div>
        );
        return (
          <div key={layer.id} data-skeleton-preview-layer={layer.kind} style={{
            position: "absolute", zIndex: layer.z,
            left: `${layer.x / stageWidth * 100}%`, top: `${layer.y / stageHeight * 100}%`,
            width: `${layer.w / stageWidth * 100}%`, height: `${layer.h / stageHeight * 100}%`,
            opacity: layer.opacity / 100, transform: `rotate(${layer.rotation}deg)`,
            background: layer.noFill || layer.kind === "triangle" || layer.kind === "line" ? "transparent" : layer.fill,
            border: layer.kind === "line" || layer.kind === "triangle" ? 0 : `${Math.max(0.5, layer.strokeWidth)}px ${layer.dashed ? "dashed" : "solid"} ${layer.stroke}`,
            borderRadius: layer.kind === "circle" ? "50%" : layer.kind === "rect" ? layer.radius : 0,
          }} className={cn("flex items-center justify-center", layer.kind === "line" && "border-t")}>
            {(layer.kind === "triangle" || layer.kind === "line") && <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${layer.w} ${layer.h}`} preserveAspectRatio="none" aria-hidden="true">{layer.kind === "triangle" ? <polygon points={`${layer.w / 2},1 ${layer.w - 1},${layer.h - 1} 1,${layer.h - 1}`} fill={layer.noFill ? "none" : layer.fill} stroke={layer.stroke} strokeWidth={layer.strokeWidth} strokeDasharray={layer.dashed ? "4 3" : undefined}/> : <line x1={0} y1={layer.lineReverse ? layer.h : 0} x2={layer.w} y2={layer.lineReverse ? 0 : layer.h} stroke={layer.stroke} strokeWidth={layer.strokeWidth}/>}</svg>}
            {layer.showLabel && layer.label && <span className="relative z-10 max-w-full truncate px-1 text-center text-[clamp(5px,1.1vw,9px)] tracking-[0.15em] text-violet-200/90" style={{ fontFamily: layer.fontFamily, fontSize: `clamp(5px, ${layer.fontSize / stageWidth * 100}vw, 9px)`, fontWeight: layer.fontWeight, lineHeight: layer.lineHeight, letterSpacing: `${Math.max(0.3, layer.letterSpacing / 3)}px` }}>{layer.label}</span>}
          </div>
        );
      }) : (
        <div className="absolute inset-3 flex flex-col gap-1.5">
          <div className="flex h-[9%] items-center justify-center rounded border border-dashed border-violet-400/50 bg-violet-400/[0.035] text-[8px] tracking-[0.2em] text-violet-200/80">NAV</div>
          <div className="flex h-[8%] items-center justify-center rounded border border-dashed border-violet-400/50 bg-violet-400/[0.035] text-[8px] tracking-[0.2em] text-violet-200/80">ANNOUNCEMENT</div>
          {variant === "hero" ? <>
            <div className="flex h-[28%] items-center justify-center rounded border border-dashed border-violet-400/50 bg-violet-400/[0.035] text-[8px] tracking-[0.2em] text-violet-200/80">HERO DISPLAY</div>
            <div className="grid h-[11%] grid-cols-2 gap-1.5"><div className="flex items-center justify-center rounded border border-dashed border-violet-400/50 bg-violet-400/[0.035] text-[7px] tracking-[0.15em] text-violet-200/80">BODY COPY</div><div className="flex items-center justify-center rounded-full border border-dashed border-violet-400/50 bg-violet-400/[0.035] text-[7px] tracking-[0.15em] text-violet-200/80">CTA PAIR</div></div>
            <div className="grid flex-1 grid-cols-3 gap-1.5">{[0,1,2].map((n)=><div key={n} className="flex items-center justify-center rounded border border-dashed border-violet-400/50 bg-violet-400/[0.035] text-[7px] tracking-[0.15em] text-violet-200/80">PRODUCT</div>)}</div>
          </> : <div className="grid flex-1 grid-cols-3 gap-1.5">{Array.from({length: variant === "cards" ? 6 : 4}, (_,i)=><div key={i} className="rounded border border-dashed border-violet-400/50 bg-violet-400/[0.035]" />)}</div>}
        </div>
      )}
      {annotations?.length ? <svg className="pointer-events-none absolute inset-0 z-[1000] size-full" viewBox={`0 0 ${stageWidth} ${stageHeight}`} aria-label="Saved visual feedback" dangerouslySetInnerHTML={{ __html: annotations.map((annotation, index) => annotationSvg(annotation, index + 1)).join("") }}/> : null}
    </div>
  );
}

function SkeletalCard({
  message,
  agentName,
  onAccept,
  onEdit,
}: {
  message: Extract<ChatMessage, { role: "skeletal" }>;
  agentName: string;
  onAccept?: (messageId: string) => void;
  onEdit?: () => void;
}) {
  const loading = message.status === "loading";
  return (
    <div
      data-skeletal-card={message.status}
      className="animate-pop artifact-surface overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3.5 pt-3">
        {loading ? (
          <LoaderCircle className="size-3.5 animate-spin text-taro" />
        ) : (
          <LayoutGrid className="size-3.5 text-taro" />
        )}
        <span className="artifact-label">
          {loading ? "Proposing skeletal design…" : "Proposed skeletal design"}
        </span>
        <span className="ml-auto font-mono text-[10px] text-[#918b9e]">{agentName}</span>
      </div>

      <div className="p-3.5">
        <SkeletalPreview variant={message.variant} layers={message.layers} annotations={message.annotations} width={message.width} height={message.height} />

        {loading ? (
          <div className="mt-3 space-y-2" aria-live="polite">
            <div className="h-2 w-2/3 animate-pulse rounded-full bg-white/10" />
            <div className="h-2 w-1/2 animate-pulse rounded-full bg-white/[0.07]" />
            <p className="pt-1 text-[11px] text-muted-foreground">Laying out blocks from the approved brief…</p>
          </div>
        ) : (
          <>
            <p className="mt-3 font-mono text-[12.5px] font-medium text-[#f7f5fb]">{message.title}</p>
            <p className="mt-1 font-mono text-[10px] leading-5 text-[#918b9e]">
              Skeletal wireframe · {message.layers?.filter((layer) => layer.kind !== "background").length ?? 8} blocks · {message.width ?? 520}×{message.height ?? 330} · tokens carried over
              {message.annotations?.length ? ` · ${message.annotations.filter(annotation => !annotation.resolved).length} open annotations` : ""}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={() => onAccept?.(message.id)} disabled={message.accepted}>
                <Check />
                Use this skeleton
              </Button>
              <Button size="sm" variant="secondary" onClick={onEdit}>
                <SlidersHorizontal />
                Modify skeleton
              </Button>
              {message.accepted && <span className="text-[11px] text-success">Accepted</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
