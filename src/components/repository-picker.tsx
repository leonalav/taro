import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Settings } from "@/data/settings";
import { sourceControl as native, useGitHubAccount, useSourceControl, type GitHubRepository } from "@/lib/source-control";

export interface RepositoryPickerProps {
  sourceControl: Settings["sourceControl"];
  patch: (value: Partial<Settings["sourceControl"]>) => void;
  workspaceRoot?: string;
}

/** Choosing GitHub metadata never changes or clones the active filesystem workspace. */
export function RepositoryPicker({ sourceControl, patch, workspaceRoot }: RepositoryPickerProps) {
  const { account } = useGitHubAccount();
  const { status } = useSourceControl(workspaceRoot);
  const [open, setOpen] = React.useState(false);
  const [repos, setRepos] = React.useState<GitHubRepository[]>([]);
  const [branches, setBranches] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [branchPage, setBranchPage] = React.useState(1);
  const [more, setMore] = React.useState(false);
  const [moreBranches, setMoreBranches] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [branchBusy, setBranchBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const repoSequence = React.useRef(0);
  const branchSequence = React.useRef(0);
  const repoDepth = React.useRef(1);
  const branchDepth = React.useRef(1);
  const repoAccount = React.useRef<string | undefined>(undefined);
  const branchScope = React.useRef("");
  const accountLogin = account?.login;
  const selected = React.useRef(sourceControl.repo); selected.current = sourceControl.repo;
  const loadRepos = React.useCallback(async (next: number, replace = false) => {
    const sequence = ++repoSequence.current;
    setBusy(true); setError("");
    try {
      const fetched: GitHubRepository[] = [];
      let hasMore = false, lastPage = next;
      for (let current = replace ? 1 : next; current <= next; current++) {
        const result = await native.repositories(current);
        if (sequence !== repoSequence.current) return;
        fetched.push(...result.items); hasMore = result.hasMore; lastPage = current;
        if (!hasMore) break;
      }
      setRepos(previous => [...new Map([...(replace ? [] : previous), ...fetched].map(repository => [repository.full_name, repository])).values()]);
      repoDepth.current = lastPage; setPage(lastPage); setMore(hasMore);
    } catch (reason) { if (sequence === repoSequence.current) setError(String(reason)); }
    finally { if (sequence === repoSequence.current) setBusy(false); }
  }, []);
  const loadBranches = React.useCallback(async (repo: string, next: number, replace = false) => {
    const sequence = ++branchSequence.current;
    setBranchBusy(true);
    try {
      const fetched: string[] = [];
      let hasMore = false, lastPage = next;
      for (let current = replace ? 1 : next; current <= next; current++) {
        const result = await native.branches(repo, current);
        if (selected.current !== repo || sequence !== branchSequence.current) return;
        fetched.push(...result.items.map(branch => branch.name)); hasMore = result.hasMore; lastPage = current;
        if (!hasMore) break;
      }
      setBranches(previous => [...new Set([...(replace ? [] : previous), ...fetched])]);
      branchDepth.current = lastPage; setBranchPage(lastPage); setMoreBranches(hasMore);
    } catch (reason) { if (selected.current === repo && sequence === branchSequence.current) setError(String(reason)); }
    finally { if (sequence === branchSequence.current) setBranchBusy(false); }
  }, []);
  React.useEffect(() => {
    const scope = `${accountLogin || ""}/${sourceControl.repo}`;
    if (branchScope.current !== scope) { branchScope.current = scope; branchDepth.current = 1; setBranches([]); setMoreBranches(false); }
    ++branchSequence.current; setBranchBusy(false);
    if (accountLogin && open && sourceControl.repo) void loadBranches(sourceControl.repo, branchDepth.current, true);
  }, [accountLogin, open, sourceControl.repo, loadBranches]);
  React.useEffect(() => {
    if (repoAccount.current !== accountLogin) { repoAccount.current = accountLogin; repoDepth.current = 1; setRepos([]); setMore(false); }
    if (accountLogin && open) void loadRepos(repoDepth.current, true);
    else { ++repoSequence.current; setBusy(false); }
  }, [accountLogin, open, loadRepos]);
  React.useEffect(() => {
    if (!accountLogin || !open) return;
    const refresh = () => { void loadRepos(repoDepth.current, true); if (sourceControl.repo) void loadBranches(sourceControl.repo, branchDepth.current, true); };
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 15000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(interval); };
  }, [accountLogin, open, sourceControl.repo, loadRepos, loadBranches]);
  React.useEffect(() => () => { ++repoSequence.current; ++branchSequence.current; }, []);
  if (!account) return null;
  const branchOptions = [
    ...(!branches.includes(sourceControl.defaultBranch) ? [{ value: sourceControl.defaultBranch, label: sourceControl.defaultBranch ? `${sourceControl.defaultBranch} (saved)` : "Choose base branch" }] : []),
    ...branches.map(branch => ({ value: branch, label: branch })),
  ];
  return <>
    <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} title={sourceControl.repo ? `GitHub: ${sourceControl.repo}` : "Choose GitHub repository"} aria-label="Choose GitHub repository">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577v-2.04c-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22v3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
    </Button>
    <Dialog open={open} onOpenChange={setOpen} labelledBy="repository-picker-title" className="w-full max-w-lg p-5">
      <h2 id="repository-picker-title" className="text-sm font-medium">GitHub repository</h2>
      <p className="mt-1 text-xs text-muted-foreground">Active workspace: {workspaceRoot || "Choose a workspace folder in Settings"}{status?.branch ? ` (${status.branch})` : ""}. Repository selection only sets the remote preference.</p>
      {!account ? <p className="mt-4 text-xs text-muted-foreground">Connect GitHub in Source Control settings to load your repositories.</p> : <div className="mt-4 space-y-3">
        <div className="flex gap-2"><Input aria-label="Filter loaded repositories" placeholder="Filter loaded repositories" value={query} onChange={e => setQuery(e.target.value)} /><Button variant="ghost" size="icon-sm" aria-label="Refresh repositories" disabled={busy} onClick={() => void loadRepos(repoDepth.current, true)}><RefreshCw /></Button></div>
        <div className="scrollbar-thin max-h-52 overflow-auto rounded-lg border border-border">
          {repos.filter(r => r.full_name.toLowerCase().includes(query.toLowerCase())).map(repo => <button key={repo.full_name} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-accent" aria-pressed={repo.full_name === sourceControl.repo} onClick={() => { setError(""); patch({ repo: repo.full_name, defaultBranch: repo.default_branch, repos: repos.map(r => r.full_name) }); }}><span>{repo.full_name}</span><span className="text-muted-foreground">{repo.full_name === sourceControl.repo ? "Selected" : repo.private ? "Private" : "Public"}</span></button>)}
          {!repos.length && !busy && <p className="p-3 text-xs text-muted-foreground">No accessible repositories returned.</p>}
        </div>
        {more && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void loadRepos(page + 1)}>Load more repositories</Button>}
        {busy && <p role="status" className="text-xs text-muted-foreground">Loading repositories…</p>}
        {!!sourceControl.repo && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">PR base branch</span>{branches.length ? <DropdownMenu ariaLabel="GitHub base branch" value={sourceControl.defaultBranch} options={branchOptions} onValueChange={defaultBranch => patch({ defaultBranch, branches })} /> : <span className="text-xs text-muted-foreground">{sourceControl.defaultBranch || "Loading branches…"}</span>}{moreBranches && <Button size="sm" variant="ghost" disabled={branchBusy} onClick={() => void loadBranches(sourceControl.repo, branchPage + 1)}>More branches</Button>}</div>}
      </div>}
      {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
      <div className="mt-5 flex justify-end"><Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Done</Button></div>
    </Dialog>
  </>;
}
