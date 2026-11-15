// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,describe,expect,it,vi} from "vitest";
import {invoke} from "@tauri-apps/api/core";
import {ExplorerPanel} from "./explorer-panel";

vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn(),isTauri:()=>false}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

describe("live Explorer controls",()=>{
  let host:HTMLDivElement|undefined;
  let root:ReturnType<typeof createRoot>|undefined;
  afterEach(()=>{if(root)act(()=>root!.unmount());host?.remove();vi.clearAllMocks();});

  it("loads real entries, opens a file, and navigates back and forward",async()=>{
    vi.mocked(invoke).mockImplementation(async(command)=>{
      if(command==="list_workspace_directory")return [{name:"notes.txt",path:"notes.txt",kind:"file"}];
      if(command==="read_workspace_file")return {kind:"text",content:"Real file contents",dataUrl:null};
      return [];
    });
    host=document.createElement("div");document.body.append(host);root=createRoot(host);
    await act(async()=>{root!.render(<ExplorerPanel root="C:\\project" folderName="project" maximized={false} onToggleMaximize={()=>{}} onClose={()=>{}} onChooseFolder={()=>{}}/>);});
    expect(host.textContent).toContain("notes.txt");
    const file=[...host.querySelectorAll("button")].find(button=>button.textContent?.includes("notes.txt"))!;
    await act(async()=>{file.click();});
    expect(host.textContent).toContain("Real file contents");
    const back=host.querySelector<HTMLButtonElement>('button[aria-label^="Back"]')!;
    expect(back.disabled).toBe(false);
    await act(async()=>{back.click();});
    expect(host.textContent).not.toContain("Real file contents");
    const forward=host.querySelector<HTMLButtonElement>('button[aria-label^="Forward"]')!;
    await act(async()=>{forward.click();});
    expect(host.textContent).toContain("Real file contents");
    await act(async()=>{host!.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')!.click();});
    expect(host.textContent).toContain("Refresh files");
    await act(async()=>{host!.querySelector<HTMLButtonElement>('button[aria-label^="Search files"]')!.click();});
    expect(host.querySelector('input[aria-label="Search files"]')).not.toBeNull();
  });
});
