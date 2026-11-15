// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {describe,expect,it,vi} from "vitest";
import {invoke} from "@tauri-apps/api/core";
import {Composer} from "./composer";

vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn(),isTauri:()=>true}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

describe("workspace file mentions",()=>{
  it("offers actual files returned for the active workspace",async()=>{
    vi.mocked(invoke).mockResolvedValue(["src/main.tsx","README.md"]);
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
    await act(async()=>{root.render(<Composer conversationId="chat" workspaceRoot="/project" onInsertionConsumed={()=>{}} placeholderTarget="project" effort={1} onEffortChange={()=>{}} onSend={()=>{}} permissionRules={[]} onSetPermissionRule={()=>{}} onRemovePermissionRule={()=>{}}/>);});
    expect(invoke).toHaveBeenCalledWith("list_workspace_files",{workspaceRoot:"/project"});
    await act(async()=>{host.querySelector<HTMLButtonElement>('button[aria-label="Mention a file or MCP server"]')!.click();});
    expect(host.querySelector('[data-menu-item="file:src/main.tsx"]')).not.toBeNull();
    expect(host.querySelector('[data-menu-item="file:README.md"]')).not.toBeNull();
    await act(async()=>{host.querySelector<HTMLButtonElement>('[data-menu-item="file:src/main.tsx"]')!.click();});
    expect(host.querySelector('[data-chip="file:src/main.tsx"]')).not.toBeNull();
    await act(async()=>root.unmount());host.remove();
  });
});
