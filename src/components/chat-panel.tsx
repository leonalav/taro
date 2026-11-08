import * as React from "react";
import { CircleCheck, Folder, GitBranch, Monitor, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Composer } from "@/components/composer";
import { MessageItem } from "@/components/chat-message";
import {EditHistoryWarning,shouldWarnOnEdit} from "@/components/edit-history-warning";
import { TaroMark } from "@/components/taro-mark";
import {
  agentName,
  starterPrompts,
  type Agent,
  type PermissionChoice,
  type Segment,
  type Thread,
} from "@/data/mock";
import type { ChipInsertion } from "@/data/mentions";
import type { PermissionRule } from "@/lib/permission-rules";
import {retryFromMessage,revertToEdit} from "@/lib/chat-history";
import { cn } from "@/utils/cn";

export type RightPanel = "explorer" | "review" | "tasks" | "git" | "docs" | null;

interface ChatPanelProps {
  /** Sessions in the active folder — the dropdown is scoped to them. */
  threads: Thread[];
  folderName: string;
  workspaceRoot?: string;
  thread: Thread;
  agent: Agent;
  thinking: boolean;
  panel: RightPanel;
  onTogglePanel: (panel: Exclude<RightPanel, null>) => void;
  /** Fixed width in px when a right panel is open; otherwise the chat fills the row. */
  width?: number;
  onSelectThread: (id: string) => void;
  onRenameThread: (id: string, name: string) => void;
  onNewThread: () => void;
  onRevert: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  onEditMessage: (messageId: string, segments: Segment[]) => void;
  onDecide: (messageId: string, choice: PermissionChoice | null) => void;
  onOpenDoc: (messageId: string) => void;
  docForMessage: (messageId: string) => string | undefined;
  onAnswerQuestion: (messageId: string, questionId: string, answer: number | null, action: "answer" | "skip" | "decline") => void;
  onAcceptSkeletal: (messageId: string) => void;
  onEditSkeletal: (message: Extract<Thread["messages"][number], { role: "skeletal" }>) => void;
  insertion?: ChipInsertion | null;
  onInsertionConsumed: (requestId: string) => void;
  onSend: (segments: Segment[]) => void;
  onStop: () => void;
  effort: number;
  onEffortChange: (index: number) => void;
  permissionRules: PermissionRule[];
  onSetPermissionRule: (rule: PermissionRule) => void;
  onRemovePermissionRule: (rule: PermissionRule) => void;
}

export function ChatPanel({
  threads,
  folderName,
  workspaceRoot,
  thread,
  thinking,
  panel,
  onTogglePanel,
  width,
  onSelectThread,
  onRenameThread,
  onNewThread,
  onRevert,
  onRetry,
  onEditMessage,
  onDecide,
  onOpenDoc,
  docForMessage,
  onAnswerQuestion,
  onAcceptSkeletal,
  onEditSkeletal,
  insertion,
  onInsertionConsumed,
  onSend,
  onStop,
  effort,
  onEffortChange,
  permissionRules,
  onSetPermissionRule,
  onRemovePermissionRule,
}: ChatPanelProps) {
  const [renaming,setRenaming]=React.useState(false);
  const [pendingEdit,setPendingEdit]=React.useState<{messageId:string;segments:Segment[]}|null>(null);
  const [revertEdit,setRevertEdit]=React.useState<{messageId:string;token:number}|null>(null);
  const [draftName,setDraftName]=React.useState("");
  React.useEffect(()=>setRenaming(false),[thread.id]);
  React.useEffect(()=>setPendingEdit(null),[thread.id]);
  React.useEffect(()=>setRevertEdit(null),[thread.id]);
  const requestEdit=(messageId:string,segments:Segment[])=>{
    if(thinking)return;
    const index=thread.messages.findIndex(message=>message.id===messageId);
    if(index>=0&&index<thread.messages.length-1&&shouldWarnOnEdit())setPendingEdit({messageId,segments});
    else onEditMessage(messageId,segments);
  };
  const requestRevert=(messageId:string)=>{
    if(thinking)return;
    const target=revertToEdit(thread.messages,messageId);
    if(!target)return;
    setRevertEdit(previous=>({messageId:target.editMessageId,token:(previous?.token??0)+1}));
    onRevert(messageId);
  };
  const commitName=()=>{if(renaming){onRenameThread(thread.id,draftName);setRenaming(false);}};
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const compact = width !== undefined && width < 480;
  const messageCount = thread.messages.length;

  // Keep the latest message in view.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messageCount, thinking, thread.id]);

  return (
    <section
      className={cn("relative flex min-w-0 flex-col", width === undefined ? "flex-1" : "shrink-0")}
      style={width === undefined ? undefined : { width, minWidth: 320, maxWidth: "calc(100% - 360px)" }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(139,92,246,0.12),transparent_70%)]"
      />

      {/* Header */}
      <header className={cn("relative z-30 flex h-14 shrink-0 items-center gap-2", compact ? "px-4" : "px-5")}>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {renaming?<input autoFocus aria-label="Rename chat" value={draftName} onChange={event=>setDraftName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")commitName();if(event.key==="Escape")setRenaming(false);}} onBlur={commitName} className="h-8 w-60 rounded-lg border border-taro/50 bg-card px-2.5 text-[13px] text-foreground outline-none"/>:<DropdownMenu
            value={thread.id}
            onValueChange={onSelectThread}
            options={threads.map((t) => ({ value: t.id, label: t.name }))}
            triggerClassName={cn("justify-between text-foreground", compact ? "w-40" : "w-60")}
            contentClassName="w-72"
            ariaLabel={`Chats in ${folderName}`}
          />}
          {thread.id!=="brand"&&<Button variant="ghost" size="icon-sm" aria-label="Rename chat" title="Rename chat" onClick={()=>{setDraftName(thread.name);setRenaming(true);}}><Pencil className="size-3.5"/></Button>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <PanelButton
            active={panel === "explorer"}
            onClick={() => onTogglePanel("explorer")}
            label="Explorer — project files"
          >
            <Folder />
          </PanelButton>
          <PanelButton
            active={panel === "git"}
            onClick={() => onTogglePanel("git")}
            label="Source control — branches, changes and history"
          >
            <GitBranch />
          </PanelButton>
          <PanelButton
            active={panel === "review"}
            onClick={() => onTogglePanel("review")}
            label="Review mode — live design preview"
          >
            <Monitor />
          </PanelButton>
          <PanelButton active={panel === "tasks"} onClick={() => onTogglePanel("tasks")} label="Tasks">
            <CircleCheck />
          </PanelButton>
          <Button variant="ghost" size="icon-sm" onClick={onNewThread} title="New thread" aria-label="New thread">
            <Plus />
          </Button>
        </div>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} className="scrollbar-thin relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 px-6 pt-6 pb-8">
          {thread.messages.length === 0 ? (
            <EmptyState onPick={onSend} />
          ) : (
            thread.messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                agentLabel={agentName}
                onRevert={requestRevert}
                onRetry={onRetry}
                editRequestToken={revertEdit?.messageId===message.id?revertEdit.token:undefined}
                revertEnabled={revertToEdit(thread.messages,message.id)!==null}
                retryEnabled={retryFromMessage(thread.messages,message.id)!==null}
                onEditMessage={requestEdit}
                busy={thinking}
                onDecide={onDecide}
                onOpenDoc={onOpenDoc}
                docForMessage={docForMessage}
                onAnswerQuestion={onAnswerQuestion}
                onAcceptSkeletal={onAcceptSkeletal}
                onEditSkeletal={onEditSkeletal}
              />
            ))
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="relative z-10 shrink-0 px-6 pt-2 pb-5">
        <div className="mx-auto max-w-[640px]">
          <Composer
            conversationId={thread.id}
            workspaceRoot={workspaceRoot}
            insertion={insertion}
            onInsertionConsumed={onInsertionConsumed}
            placeholderTarget={
              panel === "review"
                ? "Variant B"
                : panel === "tasks"
                  ? "Tasks"
                  : panel === "explorer"
                    ? folderName
                    : panel === "git"
                      ? "the current branch"
                      : thread.name
            }
            compact={compact}
            disabled={thinking}
            effort={effort}
            onEffortChange={onEffortChange}
            onSend={onSend}
            onStop={onStop}
            permissionRules={permissionRules}
            onSetPermissionRule={onSetPermissionRule}
            onRemovePermissionRule={onRemovePermissionRule}
          />
        </div>
      </div>
      <EditHistoryWarning open={pendingEdit!==null} onCancel={()=>setPendingEdit(null)} onContinue={()=>{if(pendingEdit)onEditMessage(pendingEdit.messageId,pendingEdit.segments);setPendingEdit(null);}}/>
    </section>
  );
}

function EmptyState({ onPick }: { onPick: (segments: Segment[]) => void }) {
  return (
    <div className="animate-pop flex flex-col items-center gap-5 pt-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-taro/10 ring-1 ring-inset ring-taro/25">
        <TaroMark className="size-6 text-taro" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">What should we design today?</h2>
        <p className="text-sm text-muted-foreground">
          Ask an agent to plan, write, or review. Tasks stay in sync automatically.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {starterPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick([{ type: "text", text: prompt }])}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[#333] hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="icon-sm"
      className={cn(active && "rounded-full")}
      onClick={onClick}
      aria-pressed={active}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  );
}
