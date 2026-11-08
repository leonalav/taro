// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {describe,expect,it,vi} from "vitest";
import {useWorkspaceWatch} from "./use-workspace-watch";
const io=vi.hoisted(()=>({invoke:vi.fn(),channels:[] as {onmessage:()=>void}[]}));
vi.mock("@tauri-apps/api/core",()=>({isTauri:()=>true,invoke:io.invoke,Channel:class{onmessage=()=>{};constructor(){io.channels.push(this);}}}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
function Probe({root,refresh}:{root:string;refresh:()=>Promise<void>}){useWorkspaceWatch(root,["src"],refresh,()=>{});return null;}
describe("Explorer live subscriptions",()=>{
  it("keeps a stable watcher, uses the newest callback, and cleans up on folder changes",async()=>{
    io.invoke.mockImplementation(async(name:string)=>name==="watch_workspace"?"watch-id":undefined);
    const host=document.createElement("div"),root=createRoot(host),first=vi.fn().mockResolvedValue(undefined),next=vi.fn().mockResolvedValue(undefined);
    await act(async()=>root.render(<Probe root="A:/one" refresh={first}/>));
    await act(async()=>root.render(<Probe root="A:/one" refresh={next}/>));
    expect(io.invoke.mock.calls.filter(([name])=>name==="watch_workspace")).toHaveLength(1);
    await act(async()=>io.channels[0].onmessage());expect(next).toHaveBeenCalledOnce();
    await act(async()=>root.render(<Probe root="A:/two" refresh={next}/>));
    expect(io.invoke).toHaveBeenCalledWith("unwatch_workspace",{id:"watch-id"});
    await act(async()=>root.unmount());
  });
  it("releases a watch that finishes subscribing after unmount",async()=>{
    let complete!:(id:string)=>void;
    io.invoke.mockImplementation((name:string)=>name==="watch_workspace"?new Promise(resolve=>{complete=resolve;}):Promise.resolve());
    const root=createRoot(document.createElement("div"));
    await act(async()=>root.render(<Probe root="A:/late" refresh={async()=>{}}/>));
    await act(async()=>root.unmount());
    await act(async()=>complete("late-watch"));
    expect(io.invoke).toHaveBeenCalledWith("unwatch_workspace",{id:"late-watch"});
  });
});
