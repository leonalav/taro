import * as React from "react";
import {
  Check,
  ChevronDown,
  CircleDot,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  MessageSquare,
  PanelRightClose,
  Plus,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaroMark } from "@/components/taro-mark";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------
 * Git integration / version control panel.
 * ------------------------------------------------------------------ */

type ChangeStatus = "modified" | "added" | "deleted";

interface Change {
  id: string;
  file: string;
  status: ChangeStatus;
  scope: string;
  /** AI-authored vs hand-edited. */
  author: "agent" | "you";
  staged: boolean;
}

interface Commit {
  id: string;
  message: string;
  author: string;
  branch: string;
  when: string;
  sha: string;
  files: number;
}

const STATUS_LABEL: Record<ChangeStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
};

const seedChanges: Change[] = [
  { id: "c1", file: "src/index.css", status: "modified", scope: "tokens", author: "agent", staged: true },
  { id: "c2", file: "src/components/ui/button.tsx", status: "modified", scope: "ui", author: "agent", staged: true },
  { id: "c3", file: "src/components/gallery-page.tsx", status: "modified", scope: "gallery", author: "you", staged: false },
  { id: "c4", file: "src/components/artifacts-page.tsx", status: "added", scope: "artifacts", author: "agent", staged: false },
  { id: "c5", file: "src/components/statistics-page.tsx", status: "added", scope: "statistics", author: "agent", staged: false },
  { id: "c6", file: "src/data/media.ts", status: "modified", scope: "data", author: "you", staged: false },
  { id: "c7", file: "src/legacy/tokens.d.ts", status: "deleted", scope: "cleanup", author: "agent", staged: false },
];

const seedCommits: Commit[] = [
  { id: "k1", message: "Add statistics dashboard and contribution heatmap", author: "Aria", branch: "main", when: "2m ago", sha: "8f3a1c2", files: 4 },
  { id: "k2", message: "Polish artifact thumbnails", author: "Aria", branch: "main", when: "1h ago", sha: "c41d9e0", files: 2 },
  { id: "k3", message: "Fix thinking trace rendering", author: "Maya", branch: "main", when: "3h ago", sha: "0b7e55a", files: 1 },
  { id: "k4", message: "Rework gallery into curated collection", author: "Aria", branch: "main", when: "1d ago", sha: "5d2f881", files: 6 },
  { id: "k5", message: "Add command palette search", author: "Aria", branch: "design-next", when: "2d ago", sha: "9aa34b7", files: 3 },
];

interface GitPanelProps {
  onClose: () => void;
}

export function GitPanel({ onClose }: GitPanelProps) {
  const [changes, setChanges] = React.useState<Change[]>(seedChanges);
  const [commits] = React.useState<Commit[]>(seedCommits);
  const [message, setMessage] = React.useState("");
  const [branch] = React.useState("main");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set(["changes"]));
  const [toast, setToast] = React.useState<string | null>(null);
  const [committed, setCommitted] = React.useState<Commit[]>([]);

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1800);
  };

  const staged = changes.filter((c) => c.staged);
  const unstaged = changes.filter((c) => !c.staged);
  const history = [...committed, ...commits];

  const toggleStaged = (id: string) =>
    setChanges((prev) => prev.map((c) => (c.id === id ? { ...c, staged: !c.staged } : c)));

  const commit = () => {
    if (staged.length === 0) return;
    const entry: Commit = {
      id: `new-${Date.now()}`,
      message: message.trim() || `${staged.length} change${staged.length === 1 ? "" : "s"} from Taro`,
      author: "Maya",
      branch,
      when: "just now",
      sha: Math.random().toString(16).slice(2, 9),
      files: staged.length,
    };
    setCommitted((prev) => [entry, ...prev]);
    setChanges((prev) => prev.filter((c) => !c.staged));
    setMessage("");
    flash(`Committed ${entry.files} file${entry.files === 1 ? "" : "s"} to ${branch}`);
  };

  const toggleSection = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="flex min-w-0 flex-1 flex-col bg-[#0b0b0b]">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <GitBranch className="size-4 text-taro" />
        <h2 className="text-sm font-medium">Source control</h2>
        <Badge variant="default" className="ml-1">
          {branch}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" title="New branch" aria-label="New branch" onClick={() => flash("Branch creation is not wired in this scaffold.")}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="Hide panel" aria-label="Hide panel">
            <PanelRightClose />
          </Button>
        </div>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {/* Commit composer */}
        <div className="border-b border-border p-3">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            placeholder={`Message (⌘⏎ to commit to "${branch}")`}
            aria-label="Commit message"
            className="font-mono text-xs"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={commit} disabled={staged.length === 0}>
              <Check />
              Commit {staged.length > 0 && `(${staged.length})`}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={changes.length === 0}
              onClick={() => setChanges((prev) => prev.map((c) => ({ ...c, staged: true })))}
            >
              Stage all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={staged.length === 0}
              onClick={() => setChanges((prev) => prev.map((c) => ({ ...c, staged: false })))}
            >
              Unstage all
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => flash("Reverted the last agent change.")} title="Revert last agent change">
              <Undo2 />
              Revert
            </Button>
          </div>
        </div>

        {/* Changes */}
        <Section
          title="Changes"
          count={changes.length}
          expanded={expanded.has("changes")}
          onToggle={() => toggleSection("changes")}
        >
          {changes.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Working tree clean.</p>}
          {staged.length > 0 && (
            <div className="mb-1">
              <p className="px-3 py-1 text-[10px] tracking-[0.08em] text-muted-foreground/70 uppercase">Staged</p>
              {staged.map((change) => (
                <ChangeRow key={change.id} change={change} onToggle={() => toggleStaged(change.id)} />
              ))}
            </div>
          )}
          {unstaged.length > 0 && (
            <div>
              {staged.length > 0 && (
                <p className="px-3 py-1 text-[10px] tracking-[0.08em] text-muted-foreground/70 uppercase">Unstaged</p>
              )}
              {unstaged.map((change) => (
                <ChangeRow key={change.id} change={change} onToggle={() => toggleStaged(change.id)} />
              ))}
            </div>
          )}
        </Section>

        {/* Agent review — what the agent proposes, in plain language */}
        <Section title="Agent review" count={2} expanded={expanded.has("review")} onToggle={() => toggleSection("review")}>
          <div className="flex flex-col gap-2 p-3">
            {[
              { id: "r1", title: "Update design tokens for dark mode", body: "Raises text contrast to AA and keeps the accent consistent across surfaces.", agent: "Aria" },
              { id: "r2", title: "Replace the price filter with Pro-only", body: "Removes price labels from the gallery and labels premium items instead.", agent: "Aria" },
            ].map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <TaroMark className="size-3.5 text-taro" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{item.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{item.agent}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => flash("Approved. Staged for the next commit.")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => flash("Comment saved.")}>
                    <MessageSquare />
                    Comment
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Graph / history */}
        <Section title="History" count={history.length} expanded={expanded.has("graph")} onToggle={() => toggleSection("graph")}>
          <ol className="relative ml-4 flex flex-col gap-3 border-l border-border pt-2 pb-3 pl-4">
            {history.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  className={cn(
                    "absolute top-1 -left-[21px] size-2.5 rounded-full ring-2 ring-[#0b0b0b]",
                    entry.when === "just now" ? "bg-taro" : "bg-muted-foreground/50"
                  )}
                />
                <div className="flex items-center gap-2">
                  <GitCommitHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{entry.message}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">{entry.sha}</span> · {entry.author} · {entry.when} · {entry.files} file
                  {entry.files === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <History className="size-3" />
        <span>
          {changes.length} pending · {history.length} commits
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => flash("Opening a pull request is not wired in this scaffold.")}>
          <GitPullRequest />
          Pull request
        </Button>
      </div>

      {toast && (
        <div className="animate-pop pointer-events-none fixed bottom-6 left-1/2 z-[130] -translate-x-1/2 rounded-full border border-border bg-popover px-4 py-2 text-xs text-foreground shadow-2xl">
          {toast}
        </div>
      )}
    </aside>
  );
}

function Section({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
        <span className="text-[13px] text-foreground">{title}</span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{count}</span>
      </button>
      {expanded && <div className="pb-2">{children}</div>}
    </section>
  );
}

function ChangeRow({ change, onToggle }: { change: Change; onToggle: () => void }) {
  const fileName = change.file.split("/").pop() ?? change.file;
  const dir = change.file.slice(0, change.file.length - fileName.length);

  return (
    <div className="group/row flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        aria-label={change.staged ? `Unstage ${change.file}` : `Stage ${change.file}`}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
          change.staged ? "border-taro bg-taro/25" : "border-border hover:border-muted-foreground"
        )}
      >
        {change.staged && <Check className="size-3 text-taro" strokeWidth={3} />}
      </button>
      <span
        className={cn(
          "shrink-0 font-mono text-[11px]",
          change.status === "modified" && "text-amber-400",
          change.status === "added" && "text-success",
          change.status === "deleted" && "text-destructive"
        )}
      >
        {STATUS_LABEL[change.status]}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/85" title={change.file}>
        <span className="text-muted-foreground">{dir}</span>
        {fileName}
      </span>
      <span className="shrink-0 rounded bg-accent px-1.5 text-[10px] text-muted-foreground">{change.scope}</span>
      {change.author === "agent" && <CircleDot className="size-3 shrink-0 text-taro/70" aria-label="Agent change" />}
      <FileDiff className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/row:opacity-100" />
    </div>
  );
}
