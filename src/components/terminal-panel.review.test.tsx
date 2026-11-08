// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalPanel } from "./terminal-panel";

const io = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));
vi.mock("@/lib/terminal-sessions", () => ({
  userTerminals: () => [], subscribeTerminals: () => () => {},
  listAgentTerminals: io.list, readAgentTerminal: io.read,
  createUserTerminal: vi.fn(), closeUserTerminal: vi.fn(),
  readUserTerminal: vi.fn(), writeUserTerminal: vi.fn(), resizeUserTerminal: vi.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("terminal workspace isolation review", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });

  it("clears the previous workspace commands when the next workspace cannot load", async () => {
    io.list.mockImplementation(async (workspace: string) => {
      if (workspace === "A:/first") return [{ task_id: "first-task", task_type: "local_bash", command: "secret-first-command", description: "First workspace command", status: "completed", workspaceRoot: workspace, scope: "first" }];
      throw Error("Workspace is unavailable");
    });
    io.read.mockResolvedValue({ task_id: "first-task", output: "", status: "completed" });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(<TerminalPanel root="A:/first" />));
    await act(async () => { [...host.querySelectorAll("button")].find(button => button.textContent?.startsWith("Agent"))!.click(); });
    expect(host.textContent).toContain("First workspace command");
    await act(async () => root.render(<TerminalPanel root="A:/second" />));
    expect(host.textContent).not.toContain("First workspace command");
    expect(host.querySelector('select[aria-label="Agent command"]')).toBeNull();
  });
});
