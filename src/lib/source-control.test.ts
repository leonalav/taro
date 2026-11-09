import { beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ invoke: vi.fn(), desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: io.invoke, isTauri: () => io.desktop }));
import { sourceControl, hasStagedChanges, hasWorktreeChanges } from "./source-control";
beforeEach(() => { vi.clearAllMocks(); io.desktop = true; });
describe("source control native boundary", () => {
  it("keeps staged and unstaged views for the same partial file", () => {
    const change = { path: "file", index: "M", worktree: "M", conflict: false };
    expect(hasStagedChanges(change)).toBe(true); expect(hasWorktreeChanges(change)).toBe(true);
    expect(hasStagedChanges({ ...change, index: "?", worktree: "?" })).toBe(false);
  });
  it("passes literal paths and workspace scope to native without mock success", async () => {
    io.invoke.mockRejectedValueOnce(Error("conflict"));
    await expect(sourceControl.stage("/work", ["[x] file"])).rejects.toThrow("conflict");
    expect(io.invoke).toHaveBeenCalledWith("sc_stage", { workspaceRoot: "/work", paths: ["[x] file"] });
  });
  it("rejects browser operations explicitly", async () => {
    io.desktop = false;
    await expect(sourceControl.status("/work")).rejects.toThrow(/desktop/i);
    expect(io.invoke).not.toHaveBeenCalled();
  });
  it("uses explicit pagination and never persists a token through settings", async () => {
    io.invoke.mockResolvedValue({ items: [], hasMore: false });
    await sourceControl.repositories(3);
    expect(io.invoke).toHaveBeenLastCalledWith("sc_github_repositories", { page: 3 });
    await sourceControl.connect("secret");
    expect(io.invoke).toHaveBeenLastCalledWith("sc_github_connect", { token: "secret", useGh: false });
  });
});
