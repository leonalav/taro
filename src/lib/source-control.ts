import * as React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface GitChange { path: string; originalPath?: string | null; index: string; worktree: string; conflict: boolean }
export interface GitStatus {
  root: string; branch: string | null; head: string | null; unborn: boolean; operation: string | null;
  changes: GitChange[]; branches: string[]; remoteRepository: string | null;
}
export interface GitCommit { sha: string; message: string; author: string; date: string }
export interface GitHubAccount { login: string }
export interface GitHubRepository { full_name: string; default_branch: string; private: boolean }
export interface RemotePage<T> { items: T[]; hasMore: boolean }
export interface GitHubBranch { name: string }
export interface PullRequest { html_url: string; number: number }
export const hasStagedChanges = (change: GitChange) => change.index !== " " && change.index !== "?";
export const hasWorktreeChanges = (change: GitChange) => change.worktree !== " ";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error("Source control requires the Taro desktop app.");
  return invoke<T>(command, args);
}
const listeners = new Set<(workspaceRoot?: string) => void>();
export function refreshSourceControl(workspaceRoot?: string) { for (const listener of listeners) listener(workspaceRoot); }
async function mutate<T>(command: string, workspaceRoot: string, args: Record<string, unknown> = {}) {
  const result = await call<T>(command, { workspaceRoot, ...args });
  refreshSourceControl(workspaceRoot);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("taro:source-control-success", { detail: { workspaceRoot, command, operationId: crypto.randomUUID(), result } }));
  return result;
}
export const sourceControl = {
  status: (workspaceRoot: string) => call<GitStatus>("sc_status", { workspaceRoot }),
  stage: (workspaceRoot: string, paths: string[]) => mutate<void>("sc_stage", workspaceRoot, { paths }),
  unstage: (workspaceRoot: string, paths: string[]) => mutate<void>("sc_unstage", workspaceRoot, { paths }),
  diff: (workspaceRoot: string, path: string, staged: boolean) => call<string>("sc_diff", { workspaceRoot, path, staged }),
  history: (workspaceRoot: string, page = 0) => call<GitCommit[]>("sc_history", { workspaceRoot, page }),
  commit: (workspaceRoot: string, message: string) => mutate<string>("sc_commit", workspaceRoot, { message }),
  checkout: (workspaceRoot: string, branch: string, create = false) => mutate<void>("sc_checkout", workspaceRoot, { branch, create }),
  discard: (workspaceRoot: string, path: string) => mutate<void>("sc_discard", workspaceRoot, { path }),
  revert: (workspaceRoot: string, sha: string) => mutate<void>("sc_revert", workspaceRoot, { sha }),
  push: (workspaceRoot: string) => mutate<void>("sc_push", workspaceRoot),
  pull: (workspaceRoot: string) => mutate<void>("sc_pull", workspaceRoot),
  account: () => call<GitHubAccount>("sc_github_account"),
  connect: async (token: string, useGh = false) => { const result = await call<GitHubAccount>("sc_github_connect", { token, useGh }); refreshSourceControl(); return result; },
  disconnect: async () => { await call<void>("sc_github_disconnect"); refreshSourceControl(); },
  repositories: (page = 1) => call<RemotePage<GitHubRepository>>("sc_github_repositories", { page }),
  branches: (repository: string, page = 1) => call<RemotePage<GitHubBranch>>("sc_github_branches", { repository, page }),
  pullRequest: (workspaceRoot: string, repository: string, base: string, title: string, body: string) =>
    mutate<PullRequest>("sc_github_pull_request", workspaceRoot, { repository, base, title, body }),
};

/** All views refresh together after mutations and on focus, with workspace race protection. */
export function useSourceControl(workspaceRoot?: string) {
  const [snapshot, setSnapshot] = React.useState<{ workspaceRoot: string; status: GitStatus } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const sequence = React.useRef(0);
  const refresh = React.useCallback(async () => {
    const request = ++sequence.current;
    if (!workspaceRoot) { setSnapshot(null); setError(null); setLoading(false); return; }
    setLoading(true);
    try { const value = await sourceControl.status(workspaceRoot); if (sequence.current === request) { setSnapshot({ workspaceRoot, status: value }); setError(null); } }
    catch (reason) { if (sequence.current === request) { setSnapshot(null); setError(String(reason)); } }
    finally { if (sequence.current === request) setLoading(false); }
  }, [workspaceRoot]);
  React.useEffect(() => {
    setSnapshot(null); setError(null); void refresh();
    const changed = (workspace?: string) => { if (!workspace || workspace === workspaceRoot) void refresh(); };
    const focus = () => { void refresh(); };
    listeners.add(changed); window.addEventListener("focus", focus);
    window.addEventListener("taro:workspace-changed", focus);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => { ++sequence.current; listeners.delete(changed); window.removeEventListener("focus", focus); window.removeEventListener("taro:workspace-changed", focus); window.clearInterval(interval); };
  }, [workspaceRoot, refresh]);
  return { status: snapshot?.workspaceRoot === workspaceRoot ? snapshot?.status ?? null : null, error, loading, refresh };
}

/** Auth state is checked against GitHub, never inferred from a persisted signedIn flag. */
export function useGitHubAccount() {
  const [account, setAccount] = React.useState<GitHubAccount | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const sequence = React.useRef(0);
  const refresh = React.useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    try { const value = await sourceControl.account(); if (request === sequence.current) { setAccount(value); setError(null); } }
    catch (reason) { if (request === sequence.current) { setAccount(null); setError(String(reason)); } }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  React.useEffect(() => {
    let active = true;
    const onChange = (workspace?: string) => { if (active && !workspace) void refresh(); };
    void refresh(); listeners.add(onChange);
    window.addEventListener("focus", refresh);
    return () => { active = false; ++sequence.current; listeners.delete(onChange); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  return { account, error, loading, refresh };
}
