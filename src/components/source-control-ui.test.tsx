// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: io.invoke, isTauri: () => true }));
import { RepositoryPicker } from "./repository-picker";
import { GitPanel } from "./git-panel";
import { SourceControlSettings } from "./source-control-settings";
import { defaultSettings } from "@/data/settings";
import { sourceControl, useGitHubAccount } from "@/lib/source-control";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement;
const status = { root: "/repo", branch: "main", head: "abc1234", unborn: false, operation: null, changes: [], branches: ["main"], remoteRepository: "owner/repo" };
beforeEach(() => {
  vi.clearAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  io.invoke.mockImplementation((command: string) => {
    if (command === "sc_status") return Promise.resolve(status);
    if (command === "sc_history") return Promise.resolve([]);
    if (command === "sc_github_account") return Promise.resolve({ login: "verified" });
    return Promise.resolve(undefined);
  });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.querySelectorAll('[role="dialog"]').forEach(e => e.parentElement?.remove()); });
describe("source control views", () => {
  it('approves the displayed real diff by staging that file',async()=>{
    io.invoke.mockImplementation((command:string)=>command==='sc_status'?Promise.resolve({...status,changes:[{path:'review.txt',index:' ',worktree:'M',conflict:false}]}):command==='sc_diff'?Promise.resolve('- old\n+ new'):Promise.resolve([]));
    await act(async()=>root.render(<GitPanel workspaceRoot='/repo' onClose={vi.fn()}/>));
    await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Review review.txt')!.click());
    expect(document.querySelector('[role="dialog"] pre')?.textContent).toBe('- old\n+ new');
    await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button=>button.textContent==='Approve and stage file')!.click());
    expect(io.invoke).toHaveBeenCalledWith('sc_stage',{workspaceRoot:'/repo',paths:['review.txt']});
  });
  it("hides the GitHub icon until the account is verified, regardless of saved flags", async () => {
    io.invoke.mockRejectedValue(Error("Token revoked"));
    await act(async () => root.render(<RepositoryPicker sourceControl={{ ...defaultSettings.sourceControl, signedIn: true }} patch={vi.fn()} />));
    expect(host.querySelector("button")).toBeNull();
  });
  it("shows only an icon and loads real paged repository and branch results when opened", async () => {
    const patch = vi.fn();
    io.invoke.mockImplementation((command: string) => {
      if (command === "sc_github_account") return Promise.resolve({ login: "verified" });
      if (command === "sc_github_repositories") return Promise.resolve({ items: [{ full_name: "owner/repo", default_branch: "trunk", private: true }], hasMore: true });
      if (command === "sc_github_branches") return Promise.resolve({ items: [], hasMore: false });
      return Promise.resolve(status);
    });
    await act(async () => root.render(<RepositoryPicker sourceControl={defaultSettings.sourceControl} patch={patch} workspaceRoot="/repo" />));
    const button = host.querySelector<HTMLButtonElement>('[aria-label="Choose GitHub repository"]')!;
    expect(button.textContent).toBe(""); expect(button.querySelector("svg")).not.toBeNull();
    await act(async () => button.click());
    const repo = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.includes("owner/repo"))!;
    await act(async () => repo.click());
    expect(patch).toHaveBeenCalledWith({ repo: "owner/repo", defaultBranch: "trunk", repos: ["owner/repo"] });
    expect(io.invoke).toHaveBeenCalledWith("sc_github_repositories", { page: 1 });
    expect(patch.mock.calls.some(call => "workspaceRoot" in call[0])).toBe(false);
  });
  it("ignores a pre-disconnect account request completing after the disconnect", async () => {
    let resolveOld!: (value: unknown) => void;
    io.invoke.mockImplementation((command: string) => command === "sc_github_account" ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve());
    function Account() { const { account } = useGitHubAccount(); return <span>{account?.login || "Disconnected"}</span>; }
    await act(async () => root.render(<Account />));
    io.invoke.mockImplementation((command: string) => command === "sc_github_account" ? Promise.reject(Error("No credential")) : Promise.resolve());
    await act(async () => { await sourceControl.disconnect(); });
    await act(async () => resolveOld({ login: "stale" }));
    expect(host.textContent).toBe("Disconnected");
  });
  it("preserves all loaded repository pages when refreshing or refocusing", async () => {
    io.invoke.mockImplementation((command: string, args?: { page: number }) => {
      if (command === "sc_github_account") return Promise.resolve({ login: "verified" });
      if (command === "sc_github_repositories") return Promise.resolve({ items: [{ full_name: args?.page === 2 ? "owner/second" : "owner/first", default_branch: "main", private: false }], hasMore: args?.page === 1 });
      if (command === "sc_github_branches") return Promise.resolve({ items: [{ name: "main" }], hasMore: false });
      return Promise.resolve(status);
    });
    await act(async () => root.render(<RepositoryPicker sourceControl={defaultSettings.sourceControl} patch={vi.fn()} workspaceRoot="/repo" />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Choose GitHub repository"]')!.click());
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === "Load more repositories")!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("owner/second");
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Refresh repositories"]')!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("owner/second");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("owner/second");
  });
  it("preserves loaded branch pages on focus and keeps the actual saved base visible", async () => {
    io.invoke.mockImplementation((command: string, args?: { page: number }) => {
      if (command === "sc_github_account") return Promise.resolve({ login: "verified" });
      if (command === "sc_github_repositories") return Promise.resolve({ items: [{ full_name: "owner/repo", default_branch: "main", private: false }], hasMore: false });
      if (command === "sc_github_branches") return Promise.resolve({ items: [{ name: args?.page === 2 ? "feature" : "main" }], hasMore: args?.page === 1 });
      return Promise.resolve(status);
    });
    await act(async () => root.render(<RepositoryPicker sourceControl={{ ...defaultSettings.sourceControl, repo: "owner/repo", defaultBranch: "saved-base" }} patch={vi.fn()} workspaceRoot="/repo" />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Choose GitHub repository"]')!.click());
    expect(document.querySelector('[aria-label="GitHub base branch"]')?.textContent).toContain("saved-base (saved)");
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === "More branches")!.click());
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="GitHub base branch"]')!.click());
    expect([...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toContain("feature");
    expect(document.querySelector('[aria-label="GitHub base branch"]')?.textContent).toContain("saved-base (saved)");
  });
  it("renders both index and worktree versions of a partially staged file", async () => {
    io.invoke.mockImplementation((command: string) => command === "sc_status" ? Promise.resolve({ ...status, changes: [{ path: "partial.txt", index: "M", worktree: "M", conflict: false }] }) : Promise.resolve([]));
    await act(async () => root.render(<GitPanel workspaceRoot="/repo" onClose={vi.fn()} />));
    expect(host.querySelector('[aria-label="Stage partial.txt"]')).not.toBeNull();
    const unstage = host.querySelector<HTMLButtonElement>('[aria-label="Unstage partial.txt"]')!;
    await act(async () => unstage.click());
    expect(io.invoke).toHaveBeenCalledWith("sc_unstage", { workspaceRoot: "/repo", paths: ["partial.txt"] });
  });
  it("stages edits to a staged rename using its current path, while unstaging both paths", async () => {
    io.invoke.mockImplementation((command: string) => command === "sc_status" ? Promise.resolve({ ...status, changes: [{ path: "new.txt", originalPath: "old.txt", index: "R", worktree: "M", conflict: false }] }) : Promise.resolve([]));
    await act(async () => root.render(<GitPanel workspaceRoot="/repo" onClose={vi.fn()} />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Stage new.txt"]')!.click());
    expect(io.invoke).toHaveBeenCalledWith("sc_stage", { workspaceRoot: "/repo", paths: ["new.txt"] });
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Unstage new.txt"]')!.click());
    expect(io.invoke).toHaveBeenCalledWith("sc_unstage", { workspaceRoot: "/repo", paths: ["new.txt", "old.txt"] });
  });
  it("refreshes Git immediately when Tasks or chat reports a workspace write", async () => {
    await act(async () => root.render(<GitPanel workspaceRoot="/repo" onClose={vi.fn()} />));
    io.invoke.mockImplementation((command: string) => command === "sc_status" ? Promise.resolve({ ...status, changes: [{ path: "task-output.txt", index: "?", worktree: "?", conflict: false }] }) : Promise.resolve([]));
    await act(async () => window.dispatchEvent(new Event("taro:workspace-changed")));
    expect(host.querySelector('[aria-label="Stage task-output.txt"]')).not.toBeNull();
  });
  it("applies branch-prefix and commit-style preferences without fabricating content", async () => {
    await act(async () => root.render(<GitPanel workspaceRoot="/repo" sourceControl={{ ...defaultSettings.sourceControl, branchPrefix: "custom/", commitStyle: "conventional" }} onClose={vi.fn()} />));
    expect(host.querySelector<HTMLInputElement>('[aria-label="Commit message"]')?.placeholder).toBe("feat: describe staged changes");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Commit message"]')?.value).toBe("");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="New branch"]')!.click());
    expect(document.querySelector<HTMLInputElement>('[aria-label="New branch name"]')?.value).toBe("custom/");
    expect(io.invoke).not.toHaveBeenCalledWith("sc_commit", expect.anything());
  });
  it("keeps repository/base-branch settings out of Source Control settings", async () => {
    await act(async () => root.render(<SourceControlSettings settings={defaultSettings} update={vi.fn()} />));
    expect(host.querySelector('[aria-label="Choose GitHub repository"]')).toBeNull();
    expect(host.textContent).not.toContain("Default branch");
    expect([...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')].every(button => button.disabled)).toBe(true);
  });
});
