import * as React from "react";
import { Check, FileDiff, GitBranch, GitCommitHorizontal, GitPullRequest, PanelRightClose, Plus, RefreshCw, Undo2, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import type { Settings } from "@/data/settings";
import { hasStagedChanges, hasWorktreeChanges, sourceControl as git, useSourceControl, type GitChange, type GitCommit } from "@/lib/source-control";
import {saveSourceReview} from '@/lib/source-review';
import {taskRepository} from '@/lib/task-persistence';

export interface GitPanelProps { workspaceRoot?: string; sourceControl?: Settings["sourceControl"]; onClose: () => void;onOpenTasks?:()=>void }
type Confirmation = { kind: "discard"; path: string } | { kind: "revert"; sha: string };

export function GitPanel({ workspaceRoot, sourceControl, onClose,onOpenTasks }: GitPanelProps) {
  const { status, loading, error: statusError, refresh } = useSourceControl(workspaceRoot);
  const [message, setMessage] = React.useState("");
  const [history, setHistory] = React.useState<GitCommit[]>([]);
  const [historyPage, setHistoryPage] = React.useState(0);
  const [historyMore, setHistoryMore] = React.useState(false);
  const [historyBusy, setHistoryBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [branchOpen, setBranchOpen] = React.useState(false);
  const [branchName, setBranchName] = React.useState("");
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null);
  const [preview, setPreview] = React.useState<{ path: string; staged: boolean; text: string; failed?:boolean; loading?:boolean } | null>(null);
  const [prOpen, setPrOpen] = React.useState(false);
  const [prTitle, setPrTitle] = React.useState("");
  const [prBody, setPrBody] = React.useState("");
  const [prBase, setPrBase] = React.useState(sourceControl?.defaultBranch || "");
  const [prUrl, setPrUrl] = React.useState("");
  const [reviewComment,setReviewComment]=React.useState('');
  const workspace = React.useRef(workspaceRoot); workspace.current = workspaceRoot;
  const epoch = React.useRef(0);
  const historyRequest = React.useRef(0);
  const diffRequest = React.useRef(0);
  React.useEffect(() => {
    ++epoch.current; ++historyRequest.current; ++diffRequest.current;
    setHistory([]); setHistoryPage(0); setHistoryMore(false); setHistoryBusy(false); setMessage(""); setError(""); setNotice(""); setBusy(false);
    setPreview(null); setConfirmation(null); setBranchOpen(false); setPrOpen(false); setPrUrl("");
  }, [workspaceRoot]);
  React.useEffect(() => { setPrBase(sourceControl?.defaultBranch || ""); }, [sourceControl?.defaultBranch]);
  const loadHistory = React.useCallback(async (page: number) => {
    if (!workspaceRoot) return;
    const request = ++historyRequest.current;
    setHistoryBusy(true);
    try {
      const commits = await git.history(workspaceRoot, page);
      if (workspace.current !== workspaceRoot || request !== historyRequest.current) return;
      setHistory(previous => page ? [...previous, ...commits] : commits); setHistoryPage(page); setHistoryMore(commits.length === 30);
    } catch (reason) { if (workspace.current === workspaceRoot && request === historyRequest.current) setError(String(reason)); }
    finally { if (request === historyRequest.current) setHistoryBusy(false); }
  }, [workspaceRoot]);
  React.useEffect(() => { if (status) void loadHistory(0); }, [status?.head, loadHistory]);
  async function action<T>(run: () => Promise<T>, success: string, done?: (value: T) => void) {
    if (busy || !workspaceRoot) return;
    const origin = workspaceRoot, generation = epoch.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await run();
      if (workspace.current !== origin || epoch.current !== generation) return;
      setNotice(success); done?.(result);
    } catch (reason) { if (workspace.current === origin && epoch.current === generation) { setError(String(reason)); await refresh(); } }
    finally { if (workspace.current === origin && epoch.current === generation) setBusy(false); }
  }
  function paths(changes: GitChange[], includeOriginal = false) { return [...new Set(changes.flatMap(c => includeOriginal && c.originalPath ? [c.path, c.originalPath] : [c.path]))]; }
  async function showDiff(change: GitChange, staged: boolean) {
    if (!workspaceRoot) return;
    const request = ++diffRequest.current;
    const origin = workspaceRoot;
    setReviewComment('');
    setPreview({ path: change.path, staged, text: "Loading diff…",loading:true });
    try { const text = await git.diff(origin, change.path, staged); if (workspace.current === origin && request === diffRequest.current) setPreview({ path: change.path, staged, text: text || "No textual diff. This may be a binary file or mode change." }); }
    catch (reason) { if (workspace.current === origin && request === diffRequest.current) setPreview({ path: change.path, staged, text: String(reason),failed:true }); }
  }
  const staged = status?.changes.filter(hasStagedChanges) || [];
  const unstaged = status?.changes.filter(hasWorktreeChanges) || [];
  const conflicts = status?.changes.some(c => c.conflict);
  const clean = status && !status.changes.length && !status.operation;
  const localRepo = status?.remoteRepository;
  const selectedRepo = sourceControl?.repo || localRepo || "";
  const repoMatches = !!localRepo && selectedRepo.toLowerCase() === localRepo.toLowerCase();
  const unavailable = busy || !status;
  function row(change: GitChange, isStaged: boolean) {
    return <div key={`${isStaged}:${change.path}`} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.02]">
      <Button size="icon-sm" variant="ghost" disabled={busy || change.conflict} title={isStaged ? "Unstage file" : "Stage file"} aria-label={`${isStaged ? "Unstage" : "Stage"} ${change.path}`} onClick={() => void action(() => isStaged ? git.unstage(workspaceRoot!, paths([change], true)) : git.stage(workspaceRoot!, paths([change])), isStaged ? "File unstaged" : "File staged")}>
        {isStaged ? <Check className="text-taro" /> : <Plus />}
      </Button>
      <span className={`font-mono text-[11px] ${change.conflict ? "text-destructive" : "text-amber-400"}`}>{change.conflict ? "!" : isStaged ? change.index : change.worktree}</span>
      <button className="min-w-0 flex-1 truncate text-left font-mono text-xs text-foreground/85 hover:text-foreground" title={change.path} onClick={() => void showDiff(change, isStaged)}>{change.originalPath ? `${change.originalPath} → ` : ""}{change.path}</button>
      <Button size="icon-sm" variant="ghost" aria-label={`View ${isStaged ? "staged" : "unstaged"} diff for ${change.path}`} onClick={() => void showDiff(change, isStaged)}><FileDiff /></Button>
      {!isStaged && change.index === " " && !change.conflict && <Button size="icon-sm" variant="ghost" disabled={busy} title="Discard unstaged changes" aria-label={`Discard ${change.path}`} onClick={() => setConfirmation({ kind: "discard", path: change.path })}><Undo2 /></Button>}
    </div>;
  }
  return <aside className="flex min-w-0 flex-1 flex-col bg-[#0b0b0b]">
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <GitBranch className="size-4 text-taro" /><h2 className="text-sm font-medium">Source control</h2>
      <Button className="ml-auto" variant="ghost" size="icon-sm" aria-label="Refresh source control" disabled={loading || busy} onClick={() => { void refresh(); void loadHistory(0); }}><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Hide panel" onClick={onClose}><PanelRightClose /></Button>
    </header>
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      {!workspaceRoot && <p className="p-4 text-xs text-muted-foreground">Choose a coding workspace folder in Settings to use Git.</p>}
      {statusError && <p role="alert" className="p-4 text-xs text-destructive">{statusError}</p>}
      {loading && !status && <p role="status" className="p-4 text-xs text-muted-foreground">Reading repository…</p>}
      {status && <>
        <div className="space-y-2 border-b border-border p-3">
          <p title={status.root} className="truncate font-mono text-[11px] text-muted-foreground">{status.root}</p>
          <div className="flex items-center gap-2">
            <select className="h-7 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs" aria-label="Local branch" disabled={busy || !clean} value={status.branch || ""} onChange={e => void action(() => git.checkout(workspaceRoot!, e.target.value), "Branch switched")}>
              {!status.branch && <option value="">Detached HEAD ({status.head?.slice(0, 7)})</option>}
              {[...new Set([...(status.branch ? [status.branch] : []), ...status.branches])].map(branch => <option key={branch} value={branch}>{branch}{status.unborn ? " (no commits)" : ""}</option>)}
            </select>
            <Button size="icon-sm" variant="ghost" aria-label="New branch" disabled={unavailable || !clean || status.unborn} onClick={() => { setBranchName(sourceControl?.branchPrefix || "taro/"); setBranchOpen(true); }}><Plus /></Button>
          </div>
          {!clean && <p className="text-[11px] text-muted-foreground">Commit or stash changes before switching branches.</p>}
          {status.operation && <p className="text-xs text-amber-400">A {status.operation} is in progress. Finish or abort it in your terminal.</p>}
          {conflicts && <p role="alert" className="text-xs text-destructive">Resolve conflicts in your editor or terminal before staging and committing.</p>}
        </div>
        <div className="border-b border-border p-3">
          <Input aria-label="Commit message" placeholder={sourceControl?.commitStyle === "conventional" ? "feat: describe staged changes" : "Describe the staged changes"} value={message} disabled={busy} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && message.trim() && staged.length && !conflicts) void action(() => git.commit(workspaceRoot!, message), "Commit created", () => setMessage("")); }} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !staged.length || !message.trim() || conflicts} onClick={() => void action(() => git.commit(workspaceRoot!, message), "Commit created", () => setMessage(""))}><Check />Commit{staged.length ? ` (${staged.length})` : ""}</Button>
            <Button size="sm" variant="secondary" disabled={busy || !unstaged.length || conflicts} onClick={() => void action(() => git.stage(workspaceRoot!, paths(unstaged)), "Changes staged")}>Stage all</Button>
            <Button size="sm" variant="ghost" disabled={busy || !staged.length || conflicts} onClick={() => void action(() => git.unstage(workspaceRoot!, paths(staged, true)), "Changes unstaged")}>Unstage all</Button>
          </div>
        </div>
        {staged.length > 0 && <section className="border-b border-border py-2"><h3 className="px-3 pb-1 text-xs font-medium">Staged ({staged.length})</h3>{staged.map(c => row(c, true))}</section>}
        <section className="border-b border-border py-2"><h3 className="px-3 pb-1 text-xs font-medium">Unstaged ({unstaged.length})</h3>{unstaged.map(c => row(c, false))}{!status.changes.length && <p className="px-3 py-4 text-xs text-muted-foreground">Working tree clean.</p>}</section>
        <section className='border-b border-border p-3'><h3 className='text-xs font-medium'>Agent review</h3><p className='mt-1 text-xs leading-5 text-muted-foreground'>Review current workspace changes. Approve a file to stage it, or save feedback as a task for the agent.</p>{unstaged.map(change=><Button key={change.path} size='sm' variant='ghost' className='mt-1 max-w-full' onClick={()=>void showDiff(change,false)}><FileDiff/><span className='truncate'>Review {change.path}</span></Button>)}{!unstaged.length&&<p className='mt-2 text-xs text-muted-foreground'>No unstaged changes to review.</p>}</section>
        <section className="p-3"><h3 className="mb-3 text-xs font-medium">History</h3><ol className="space-y-3">{history.map(entry => <li key={entry.sha} className="flex items-start gap-2"><GitCommitHorizontal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-xs" title={entry.message}>{entry.message}</p><p className="mt-1 text-[11px] text-muted-foreground"><span className="font-mono">{entry.sha.slice(0, 7)}</span> · {entry.author} · {new Date(entry.date).toLocaleDateString()}</p></div><Button size="icon-sm" variant="ghost" disabled={busy || !clean} aria-label={`Revert commit ${entry.sha.slice(0, 7)}`} title="Revert commit with a new commit" onClick={() => setConfirmation({ kind: "revert", sha: entry.sha })}><Undo2 /></Button></li>)}</ol>{!history.length && !historyBusy && <p className="text-xs text-muted-foreground">No commits yet.</p>}{historyMore && <Button className="mt-3" size="sm" variant="ghost" disabled={historyBusy} onClick={() => void loadHistory(historyPage + 1)}>Load more commits</Button>}</section>
      </>}
      {error && <p role="alert" className="m-3 break-words rounded-lg border border-destructive/30 p-3 text-xs text-destructive">{error}</p>}
      {notice && <p role="status" className="px-3 py-2 text-xs text-success">{notice}</p>}
      {busy && <p role="status" className="px-3 py-2 text-xs text-muted-foreground">Git operation in progress…</p>}
    </div>
    <footer className="flex flex-wrap items-center gap-1 border-t border-border p-2">
      <Button size="sm" variant="ghost" disabled={unavailable || !status?.branch || !!status?.operation} onClick={() => void action(() => git.push(workspaceRoot!), "Branch pushed to origin")}><Upload />Push</Button>
      <Button size="sm" variant="ghost" disabled={unavailable || !clean || !status?.branch} onClick={() => void action(() => git.pull(workspaceRoot!), "Fast-forward pull completed")}><Download />Pull</Button>
      <Button className="ml-auto" size="sm" variant="ghost" disabled={unavailable || !repoMatches || !clean || !status?.branch} title={!repoMatches ? "Select the GitHub repository matching this workspace's origin" : "Push your branch before opening a pull request"} onClick={() => { setPrTitle(""); setPrBody(""); setPrUrl(""); setPrOpen(true); }}><GitPullRequest />Pull request</Button>
    </footer>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) { ++diffRequest.current; setPreview(null); } }} labelledBy="git-diff-title" className="flex max-h-[85vh] w-full max-w-4xl flex-col p-4">
      <h3 id="git-diff-title" className="mb-3 truncate text-sm">{preview?.staged ? "Staged" : "Unstaged"} diff · {preview?.path}</h3><pre className="scrollbar-thin min-h-0 overflow-auto rounded-lg bg-background p-3 font-mono text-xs whitespace-pre">{preview?.text}</pre>
      <textarea aria-label='Review comment' value={reviewComment} onChange={event=>setReviewComment(event.target.value)} placeholder='Describe feedback for the agent. Comments are saved as tasks.' className='mt-3 min-h-20 shrink-0 rounded-lg border border-border bg-card p-3 text-xs'/>
      <div className='mt-3 flex flex-wrap justify-end gap-2'><Button size='sm' variant='secondary' disabled={busy||!reviewComment.trim()||!preview} onClick={()=>{if(preview)void action(()=>saveSourceReview(workspaceRoot!,preview.path,reviewComment,taskRepository),'Review comment saved in Tasks',()=>{setPreview(null);onOpenTasks?.();});}}>Save comment as task</Button>{preview&&!preview.staged&&<Button size='sm' disabled={busy||!!conflicts||preview.loading||preview.failed} onClick={()=>{if(preview)void action(()=>git.stage(workspaceRoot!,[preview.path]),'Reviewed file staged',()=>setPreview(null));}}><Check/>Approve and stage file</Button>}<Button size='sm' variant='ghost' onClick={()=>{++diffRequest.current;setPreview(null);}}>Close</Button></div>
      {error&&<p role='alert' className='mt-2 text-xs text-destructive'>{error}</p>}
    </Dialog>
    <Dialog open={branchOpen} onOpenChange={setBranchOpen} labelledBy="new-branch-title" className="w-full max-w-md space-y-3 p-5"><h3 id="new-branch-title" className="text-sm font-medium">Create and switch branch</h3><Input aria-label="New branch name" value={branchName} onChange={e => setBranchName(e.target.value)} /><p className="text-xs text-muted-foreground">Creates a branch from the current HEAD. Your worktree must be clean.</p><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setBranchOpen(false)}>Cancel</Button><Button size="sm" disabled={busy || !branchName.trim()} onClick={() => void action(() => git.checkout(workspaceRoot!, branchName.trim(), true), "Branch created", () => setBranchOpen(false))}>Create branch</Button></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</Dialog>
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }} labelledBy="git-confirm-title" className="w-full max-w-md space-y-3 p-5"><h3 id="git-confirm-title" className="text-sm font-medium">{confirmation?.kind === "discard" ? "Discard unstaged changes?" : "Revert this commit?"}</h3><p className="break-words text-xs text-muted-foreground">{confirmation?.kind === "discard" ? `Unstaged edits to ${confirmation.path} will be lost. This cannot be undone by Git.` : `Git will create a new commit reversing ${confirmation?.sha.slice(0, 7)}. Conflicts must be resolved in your terminal.`}</p><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setConfirmation(null)}>Cancel</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => { const value = confirmation; if (value) void action(() => value.kind === "discard" ? git.discard(workspaceRoot!, value.path) : git.revert(workspaceRoot!, value.sha), value.kind === "discard" ? "Unstaged changes discarded" : "Revert commit created", () => setConfirmation(null)); }}>Confirm {confirmation?.kind === "discard" ? "discard" : "revert"}</Button></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</Dialog>
    <Dialog open={prOpen} onOpenChange={setPrOpen} labelledBy="git-pr-title" className="w-full max-w-lg space-y-3 p-5"><h3 id="git-pr-title" className="text-sm font-medium">Open pull request</h3><p className="text-xs text-muted-foreground">{selectedRepo} · {status?.branch}. Push your branch first.</p><Input aria-label="Pull request title" placeholder="Title" value={prTitle} onChange={e => setPrTitle(e.target.value)} /><Input aria-label="Pull request base branch" placeholder="Base branch" value={prBase} onChange={e => setPrBase(e.target.value)} /><textarea aria-label="Pull request description" placeholder="Description" value={prBody} onChange={e => setPrBody(e.target.value)} className="min-h-28 w-full rounded-lg border border-border bg-card p-2 text-xs" />{prUrl ? <a href={prUrl} target="_blank" rel="noreferrer" className="block text-xs text-taro underline">View pull request on GitHub</a> : <p className="text-xs text-muted-foreground">Creates a real GitHub pull request with your saved credentials.</p>}<div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setPrOpen(false)}>Close</Button><Button size="sm" disabled={busy || !!prUrl || !prTitle.trim() || !prBase.trim()} onClick={() => void action(() => git.pullRequest(workspaceRoot!, selectedRepo, prBase.trim(), prTitle.trim(), prBody), "Pull request created", result => setPrUrl(result.html_url))}>Create pull request</Button></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</Dialog>
  </aside>;
}
