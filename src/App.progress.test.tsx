// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatPanel } from "./components/chat-panel";
import type { ToolCall } from "./lib/model-stream";
import App from "./App";
import { defaultSettings } from "./data/settings";
import {getUsageMetricsSnapshot} from "./lib/usage-metrics";

type View=ComponentProps<typeof ChatPanel>;
const io=vi.hoisted(()=>({view:null as View|null,load:vi.fn(),persist:vi.fn().mockResolvedValue(undefined),stream:vi.fn(),stop:vi.fn().mockResolvedValue(undefined),execute:vi.fn(),list:vi.fn(),chooseFolder:vi.fn()}));
vi.mock("@tauri-apps/plugin-dialog",()=>({open:io.chooseFolder}));
vi.mock("@tauri-apps/api/core",()=>({isTauri:()=>true,invoke:vi.fn().mockResolvedValue([])}));
vi.mock("./components/title-bar",()=>({TitleBar:({onHome}:{onHome?:()=>void})=><button aria-label="Go to welcome" onClick={onHome}>Home</button>}));
vi.mock("./components/chat-panel",()=>({ChatPanel:(props:View)=>{io.view=props;return null;}}));
vi.mock("./lib/chat-db",()=>({loadChat:io.load,persistChat:io.persist,persistModels:io.persist,persistPermissionRules:io.persist,persistWorkspaceRules:io.persist}));
vi.mock("./lib/model-stream",()=>({streamModel:io.stream,stopModel:io.stop}));
vi.mock("./lib/agent-tools",async importOriginal=>({...await importOriginal<typeof import("./lib/agent-tools")>(),executeAgentTool:io.execute,listMcpTools:io.list}));

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{
  localStorage.clear();vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});
  io.load.mockResolvedValue({threads:[{id:"brand",name:"Nike/Brand Discovery",folderId:"taro",updated:"now",messages:[]}],folders:[{id:"taro",name:"taro",path:"A:/taro"}],models:{...defaultSettings.models,defaultModel:"test",customModels:[{id:"test",label:"Test model",endpoint:"http://example.invalid"}],streamResponses:false},plugins:[],permissionRules:[]});
  io.stop.mockResolvedValue(undefined);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const thought=()=>io.view!.thread.messages.find(message=>message.role==="thought")!;
const send=async()=>{await act(async()=>{root.render(<App/>);});await act(async()=>{io.view!.onSend([{type:"text",text:"Inspect a.ts"}]);});};

describe("agentic ThoughtLine lifecycle",()=>{
  it("preserves an unsent welcome draft when a project is resumed and Home is opened",async()=>{
    await act(async()=>root.render(<App/>));
    const editor=host.querySelector<HTMLElement>('[data-reception-surface] [aria-label="Message"]')!;
    await act(async()=>{editor.textContent="An unfinished idea";editor.dispatchEvent(new Event("input",{bubbles:true}));});
    await act(async()=>host.querySelector<HTMLButtonElement>(".reception-recent")!.click());
    expect(host.querySelector('[data-reception-surface]')?.classList.contains("hidden")).toBe(true);
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Go to welcome"]')!.click());
    expect(editor.textContent).toBe("An unfinished idea");
    expect(host.querySelector('[data-reception-surface]')?.classList.contains("hidden")).toBe(false);
    expect(io.stream).not.toHaveBeenCalled();
  });

  it("hands a welcome prompt to a new chat before requesting the model",async()=>{
    io.stream.mockResolvedValue([]);
    await act(async()=>root.render(<App/>));
    expect(host.querySelector('main[aria-label="Welcome to Taro"]')).not.toBeNull();
    const editor=host.querySelector<HTMLElement>('[aria-label="Message"]')!;
    await act(async()=>{editor.textContent="Build my reception project";editor.dispatchEvent(new Event("input",{bubbles:true}));});
    await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click();});
    expect(io.view!.thread.id).not.toBe("brand");
    expect(io.view!.thread.messages.find(message=>message.role==="user")).toMatchObject({segments:[{type:"text",text:"Build my reception project"}]});
    expect(JSON.stringify(io.stream.mock.calls[0][0].messages)).toContain("Build my reception project");
    expect(host.querySelector('[data-reception-surface]')?.classList.contains("hidden")).toBe(true);
  });

  it("applies the selected workspace's saved rules to the actual primary request",async()=>{
    localStorage.setItem("taro-workspace-rules-v1",JSON.stringify({"path:a:/taro":[{id:"custom",scope:"Code",text:"Use the selected workspace convention",enabled:true}],"path:a:/other":[{id:"other",scope:"Always",text:"Other folder private rule",enabled:true}]}));
    io.stream.mockResolvedValue([]);
    await send();
    const context=JSON.stringify(io.stream.mock.calls[0][0].messages);
    expect(context).toContain("Use the selected workspace convention");
    expect(context).not.toContain("Other folder private rule");
  });

  it("changes the active folder path when its workspace is chosen in Settings",async()=>{
    io.chooseFolder.mockResolvedValue("A:/different-workspace");
    await act(async()=>root.render(<App/>));
    const button=(label:string)=>[...host.ownerDocument.querySelectorAll("button")].find(item=>item.getAttribute("aria-label")===label||item.textContent?.trim()===label)!;
    await act(async()=>button("Settings").click());
    await act(async()=>button("Plugins").click());
    await act(async()=>button("Choose folder").click());
    expect(io.view!.workspaceRoot).toBe("A:/different-workspace");
  });

  it("exposes discovered PowerShell to the next model request and executes after approval",async()=>{
    io.stream.mockResolvedValueOnce([{id:"search",name:"ToolSearch",arguments:'{"query":"select:PowerShell"}'}]).mockImplementationOnce(async request=>{
      expect(request.tools.map((tool:{function:{name:string}})=>tool.function.name)).toContain("PowerShell");
      return [{id:"ps",name:"PowerShell",arguments:'{"command":"Write-Output hello"}'}];
    }).mockResolvedValueOnce([]);
    io.execute.mockResolvedValue({text:"hello",artifact:{kind:"terminal",stdout:"hello",status:"completed",exitCode:0}});
    await send();
    const permission=io.view!.thread.messages.find(message=>message.role==="permission")!;
    expect(permission).toMatchObject({tool:"Ran Write-Output hello"});
    expect(io.execute).not.toHaveBeenCalled();
    await act(async()=>io.view!.onDecide(permission.id,{label:"Allow once",allowed:true,target:"tool",duration:"once"}));
    expect(io.execute.mock.calls[0][0]).toMatchObject({name:"PowerShell"});
    expect(io.execute.mock.calls[0][3]).toBe(true);
    expect(io.view!.thread.messages.some(message=>message.role==="activity-group"&&message.activities.some(activity=>activity.kind==="terminal"&&activity.status==="done"))).toBe(true);
    expect(thought()).toMatchObject({status:"completed"});
  });

  it("shows the real plan and opens its Markdown before one-time exit approval",async()=>{
    io.stream.mockResolvedValueOnce([{id:"enter",name:"EnterPlanMode",arguments:'{"kind":"Design Plan"}'}]).mockResolvedValueOnce([{id:"exit",name:"ExitPlanMode",arguments:'{}'}]).mockResolvedValueOnce([]);
    io.execute.mockImplementation(async(call,_input,_root,approved)=>call.name==="EnterPlanMode"?{text:"Entered planning",artifact:{kind:"plan-mode",path:"plans/live.md"}}:{text:"Live plan",artifact:{kind:"plan",name:"Live design",path:"plans/live.md",markdown:"# Live design\n\nInspect the actual project.",planKind:"Design Plan",approvalRequired:!approved}});
    await send();
    const plan=io.view!.thread.messages.find(message=>message.role==="plan")!;
    expect(plan).toMatchObject({kind:"Design Plan",name:"Live design",path:"plans/live.md",markdown:expect.stringContaining("Inspect the actual project.")});
    const permission=io.view!.thread.messages.find(message=>message.role==="permission")!;
    expect(permission).toMatchObject({onceOnly:true});
    await act(async()=>io.view!.onOpenDoc(plan.id));
    expect(host.querySelector('[data-doc-body]')?.textContent).toContain("Inspect the actual project.");
    expect(io.execute.mock.calls.filter(([tool])=>tool.name==="ExitPlanMode")).toHaveLength(1);
    await act(async()=>io.view!.onDecide(permission.id,{label:"Allow once",allowed:true,target:"tool",duration:"once"}));
    expect(io.execute.mock.calls.filter(([tool])=>tool.name==="ExitPlanMode").map(args=>args[3])).toEqual([false,true]);
    expect(thought()).toMatchObject({status:"completed"});
  });

  it("keeps one progress message through permissions, tools, and the next model response",async()=>{
    let finishTool!:(result:unknown)=>void,finishStream!:(calls:ToolCall[])=>void;
    io.stream.mockImplementationOnce(async()=>[{id:"edit",name:"Edit",arguments:'{"file_path":"a.ts","old_string":"old","new_string":"new"}'}]).mockImplementationOnce(()=>new Promise(resolve=>{finishStream=resolve;}));
    io.execute.mockImplementation(()=>new Promise(resolve=>{finishTool=resolve;}));
    await send();
    expect(thought()).toMatchObject({status:"working",label:"Waiting for approval…"});
    const id=thought().id;
    const permission=io.view!.thread.messages.find(message=>message.role==="permission")!;
    await act(async()=>io.view!.onDecide(permission.id,{label:"Allow once",allowed:true,target:"tool",duration:"once"}));
    expect(thought()).toMatchObject({id,label:"Using tools…"});
    await act(async()=>finishTool({text:"Edited a.ts",artifact:{kind:"edit",path:"a.ts",before:"old",after:"new"}}));
    expect(thought()).toMatchObject({id,status:"working",label:"Thinking…"});
    await act(async()=>finishStream([]));
    expect(getUsageMetricsSnapshot()).toMatchObject({totalMessages:1,totalLinesAdded:1});
    expect(thought()).toMatchObject({id,status:"completed"});
    expect(io.view!.thread.messages.filter(message=>message.role==="thought")).toHaveLength(1);
    expect(io.view!.thinking).toBe(false);
  });

  it("settles stopped progress and cancels the live model request",async()=>{
    let finishStream!:(calls:ToolCall[])=>void;
    io.stream.mockImplementation(()=>new Promise(resolve=>{finishStream=resolve;}));
    await send();
    io.stop.mockImplementation(async()=>{finishStream([]);});
    await act(async()=>io.view!.onStop());
    expect(io.stop).toHaveBeenCalled();expect(thought()).toMatchObject({status:"stopped"});
    expect(io.view!.thinking).toBe(false);
  });

  it("settles failed progress when the model connection fails",async()=>{
    io.stream.mockRejectedValueOnce(Error("Connection failed"));
    await send();
    expect(thought()).toMatchObject({status:"failed"});
    expect(io.view!.thinking).toBe(false);
    expect(io.view!.thread.messages.some(message=>message.role==="agent"&&message.text.includes("Connection failed"))).toBe(true);
  });

  it("stops during stalled MCP discovery and ignores its late result",async()=>{
    const data=await io.load();
    io.load.mockResolvedValue({...data,plugins:[{id:"slow",name:"Slow MCP",kind:"MCP",enabled:true,transport:"stdio",command:"slow-server"}]});
    let finishDiscovery!:(value:{tools:[]})=>void;
    io.list.mockImplementation(()=>new Promise(resolve=>{finishDiscovery=resolve;}));
    await send();
    expect(thought()).toMatchObject({status:"working",label:"Connecting tools…"});
    await act(async()=>io.view!.onStop());
    expect(thought()).toMatchObject({status:"stopped"});
    expect(io.view!.thinking).toBe(false);
    await act(async()=>finishDiscovery({tools:[]}));
    expect(io.stream).not.toHaveBeenCalled();
    expect(thought()).toMatchObject({status:"stopped"});
  });
});
