// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatPanel } from "./components/chat-panel";
import type { ToolCall } from "./lib/model-stream";
import App from "./App";
import {invoke} from '@tauri-apps/api/core';
import { defaultSettings } from "./data/settings";
import {taskRepository} from "./lib/task-persistence";
import {workspaceRuleKey} from "./lib/workspace-preferences";
import {getUsageMetricsSnapshot} from "./lib/usage-metrics";
import {loadChildCheckpoints} from "./lib/chat-db";
import type {SavedChild} from "./lib/subagent-continuity";

type View=ComponentProps<typeof ChatPanel>;
const io=vi.hoisted(()=>({taskRows:new Map<string,string>(),adiRows:new Map<string,{generation:number;payload:string}>(),view:null as View|null,load:vi.fn(),persist:vi.fn().mockResolvedValue(undefined),stream:vi.fn(),stop:vi.fn().mockResolvedValue(undefined),execute:vi.fn(),list:vi.fn(),chooseFolder:vi.fn()}));
vi.mock("@tauri-apps/plugin-dialog",()=>({open:io.chooseFolder}));
vi.mock("@tauri-apps/api/core",()=>({isTauri:()=>true,invoke:vi.fn().mockResolvedValue([])}));
vi.mock("./components/title-bar",()=>({TitleBar:({onHome}:{onHome?:()=>void})=><button aria-label="Go to welcome" onClick={onHome}>Home</button>}));
vi.mock("./components/chat-panel",()=>({ChatPanel:(props:View)=>{io.view=props;return null;}}));
vi.mock("./lib/chat-db",()=>({chatDb:async()=>({
  select:async(sql:string,[key]:[string])=>{const payload=io.taskRows.get(key);const row=sql.includes("task_boards")?(payload?{payload}:undefined):io.adiRows.get(key);return row?[row]:[];},
  execute:async(sql:string,params:unknown[]=[])=>{
    if(sql.startsWith('INSERT INTO task_boards')){const [key,payload]=params as [string,string];io.taskRows.set(key,payload);}
    if(sql.startsWith('INSERT INTO adi_runs')){const [key,generation,payload]=params as [string,number,string];if(io.adiRows.has(key))return {rowsAffected:0};io.adiRows.set(key,{generation,payload});}
    if(sql.startsWith('UPDATE adi_runs')){const [generation,payload,key,expected]=params as [number,string,string,number];if(io.adiRows.get(key)?.generation!==expected)return {rowsAffected:0};io.adiRows.set(key,{generation,payload});}
    return {rowsAffected:1};
  },
}),loadChat:io.load,loadChildCheckpoints:vi.fn().mockResolvedValue([]),saveChildCheckpoint:io.persist,persistChat:io.persist,persistModels:io.persist,persistWorkspaceSettings:io.persist,persistPermissionRules:io.persist,persistWorkspaceRules:io.persist}));
vi.mock("./lib/model-stream",()=>({streamModel:io.stream,stopModel:io.stop}));
vi.mock("./lib/agent-tools",async importOriginal=>({...await importOriginal<typeof import("./lib/agent-tools")>(),executeAgentTool:io.execute,listMcpTools:io.list}));

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{
  localStorage.clear();io.adiRows.clear();vi.resetAllMocks();vi.mocked(invoke).mockResolvedValue([]);io.persist.mockResolvedValue(undefined);
  Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});
  io.load.mockResolvedValue({threads:[{id:"brand",name:"Nike/Brand Discovery",folderId:"taro",updated:"now",messages:[]}],folders:[{id:"taro",name:"taro",path:"A:/taro"}],models:{...defaultSettings.models,defaultModel:"test",customModels:[{id:"test",label:"Test model",endpoint:"http://example.invalid"}],streamResponses:false},plugins:[],permissionRules:[]});
  io.stop.mockResolvedValue(undefined);
  vi.mocked(loadChildCheckpoints).mockResolvedValue([]);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const thought=()=>io.view!.thread.messages.find(message=>message.role==="thought")!;
const send=async()=>{await act(async()=>{root.render(<App/>);});await act(async()=>{io.view!.onSend([{type:"text",text:"Inspect a.ts"}]);});};

describe("agentic ThoughtLine lifecycle",()=>{
  it("pings a saved child when its chat reopens and gives the orchestrator its result",async()=>{
    const data=await io.load();
    const childId="agent-app-reconnect";
    const request={credentialId:"test",endpoint:"http://example.invalid",model:"Test model",
      messages:[{role:"system",content:"Frozen child rules"},{role:"user",content:"Inspect the file"}],tools:[]};
    const saved:SavedChild={
      message:{id:"saved-child",role:"subagent",agentId:"planner",childId,subagentType:"Explore",description:"Inspect the file",
        prompt:"Inspect the file",status:"running",runInBackground:true,activities:[]},
      checkpoint:{version:1,root:"A:/taro",rootSessionId:"brand",parentSessionId:"brand",
        owner:{sessionId:"brand:"+childId,workspaceRoot:"A:/taro",readOnly:true,depth:1,childId},
        model:{credentialId:request.credentialId,endpoint:request.endpoint,model:request.model},
        messages:request.messages,request,loadedTools:[],round:0},
    };
    io.load.mockResolvedValue({...data,threads:[{...data.threads[0],messages:[
      {id:"saved-user",role:"user",segments:[{type:"text",text:"Inspect a.ts"}]},
      {...saved.message,waitingForConnection:true},
    ]}]});
    vi.mocked(loadChildCheckpoints).mockResolvedValue([saved]);
    io.stream.mockImplementation(async(input,delta)=>{
      if(input.messages.some((message:{content?:string})=>message.content==="Frozen child rules")){
        delta("Recovered finding.");
        return [];
      }
      if(input.messages.some((message:{role?:string})=>message.role==="tool")){
        delta("I used the recovered finding.");
        return [];
      }
      return [{id:"check-child",name:"TaskOutput",arguments:JSON.stringify({task_id:childId})}];
    });
    await act(async()=>{root.render(<App/>);});
    expect(io.view!.thread.messages.filter(message=>message.role==="user")).toHaveLength(1);
    expect(io.view!.thread.messages).toContainEqual(expect.objectContaining({childId,status:"completed",result:"Recovered finding."}));
    expect(io.stream.mock.calls.map(([input])=>input)).toContainEqual(expect.objectContaining(request));
    expect(JSON.stringify(io.stream.mock.calls.at(-1)?.[0].messages)).toContain("Recovered finding.");
    expect(io.execute.mock.calls.some(([tool])=>tool.name==="Agent")).toBe(false);
  });
  it("sends the request to the Orchestrator before delegating without an approval",async()=>{
    const data=await io.load();
    const agents=[
      {id:"orchestrator",name:"Kai",role:"Orchestrator agent",model:"test",enabled:true,autonomy:"ask",canWriteCode:true},
      {id:"qa",name:"Theo",role:"Type & QA",model:"qa-model",enabled:true,autonomy:"ask",canWriteCode:false},
    ];
    io.load.mockResolvedValue({...data,preferences:{...defaultSettings,models:{...data.models,customModels:[...data.models.customModels,{id:"qa-model",label:"QA model",endpoint:"http://qa.invalid"}]},agents}});
    io.execute.mockResolvedValue({text:"Authorized",artifact:{kind:"agent-authorization",workspaceRoot:"A:/taro"}});
    io.stream.mockResolvedValueOnce([{id:"delegate",name:"Agent",arguments:JSON.stringify({description:"Inspect TypeScript",prompt:"Read a.ts and identify selectors.",subagent_type:"Type & QA",read_only:true})}])
      .mockImplementationOnce(async(_request,delta)=>{delta("Child found the relevant selector.");return [];})
      .mockImplementationOnce(async(_request,delta)=>{delta("The QA finding is available.");return [];});
    await act(async()=>{root.render(<App/>);});
    await act(async()=>io.view!.onSend([{type:"text",text:"Ask the QA agent to inspect a.ts."}]));
    expect(io.stream.mock.calls.map(([request])=>request.credentialId)).toEqual(["test","qa-model","test"]);
    expect(io.stream.mock.calls[0][0].messages).toContainEqual({role:"user",content:"Ask the QA agent to inspect a.ts."});
    expect(io.stream.mock.calls[1][0].messages).toContainEqual({role:"user",content:"Read a.ts and identify selectors."});
    expect(io.view!.thread.messages.some(message=>message.role==="permission")).toBe(false);
    expect(io.view!.thread.messages).toContainEqual(expect.objectContaining({role:"subagent",subagentType:"Type & QA",status:"completed"}));
    expect(JSON.stringify(io.stream.mock.calls.at(-1)?.[0].messages)).toContain("Child found the relevant selector.");
  });
  it('stops a stalled web request and retains a stopped source row',async()=>{
    io.stream.mockResolvedValueOnce([{id:'web-stop',name:'WebSearch',arguments:'{"query":"css"}'}]);
    io.execute.mockImplementationOnce(()=>new Promise(()=>{}));
    await send();
    expect(io.view!.thread.messages.filter(m=>m.role==='activity-group').flatMap(m=>m.activities).find(a=>a.id==='web-stop')).toMatchObject({status:'running',web:{kind:'web-search'}});
    await act(async()=>io.view!.onStop());
    expect(io.view!.thread.messages.filter(m=>m.role==='activity-group').flatMap(m=>m.activities).find(a=>a.id==='web-stop')).toMatchObject({status:'stopped',label:'Web search stopped'});
    expect(io.view!.thinking).toBe(false);
  });
  it('offers and executes web tools without a workspace and persists read source rows',async()=>{
    const data=await io.load();io.load.mockResolvedValue({...data,workspaceRoot:'',folders:[{id:'taro',name:'taro',path:''}]});
    io.stream.mockResolvedValueOnce([{id:'search',name:'WebSearch',arguments:'{"query":"css"}'}]).mockResolvedValueOnce([{id:'fetch',name:'WebFetch',arguments:'{"url":"https://example.com/a"}'}]).mockImplementationOnce(async(_request,delta)=>{delta('Read the page.');return [];});
    io.execute.mockImplementation(async(tool)=>tool.name==='WebSearch'?{text:'Source A',artifact:{kind:'web-search',query:'css',sources:[{url:'https://example.com/a',title:'A'}]}}:{text:'Page A',artifact:{kind:'web-fetch',requestedUrl:'https://example.com/a',finalUrl:'https://example.com/a',title:'A',content:'Readable page'}});
    await send();
    expect(io.stream.mock.calls[0][0].tools.map((t:{function:{name:string}})=>t.function.name)).toEqual(expect.arrayContaining(['WebSearch','WebFetch']));
    expect(io.execute.mock.calls.map(([tool])=>tool.name)).toEqual(['WebSearch','WebFetch']);
    expect(io.view!.thread.messages.filter(m=>m.role==='activity-group').flatMap(m=>m.activities).find(a=>a.web?.kind==='web-search')?.web).toMatchObject({sources:[{read:true}]});
    expect(io.view!.thread.messages.some(m=>m.role==='permission')).toBe(false);
  });
  it('shares discovered skills with the slash menu and the first agent request without a Settings toggle',async()=>{
    vi.mocked(invoke).mockImplementation(async(command)=>command==='discover_installed_skills'?[{name:'review',description:'Review workspace changes',path:'A:/taro/.taro/skills/review/SKILL.md',source:'Taro workspace'}]:[]);
    io.stream.mockResolvedValue([]);
    try{
      await act(async()=>root.render(<App/>));
      await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Insert a slash command"]')!.click());
      expect(host.querySelector('[data-menu-item="skill:review"]')).not.toBeNull();
      await act(async()=>host.querySelector<HTMLButtonElement>('[data-menu-item="skill:review"]')!.click());
      await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click());
      const request=io.stream.mock.calls.map(([request])=>request).find(request=>Array.isArray(request.tools));
      expect(request.tools.map((tool:{function:{name:string}})=>tool.function.name)).toContain('Skill');
      expect(JSON.stringify(request.messages)).toContain('Review workspace changes');
      expect(JSON.stringify(request.messages)).toContain('by invoking the Skill tool');
    }finally{vi.mocked(invoke).mockResolvedValue([]);}
  });
  it('preserves unknown durable state when initial storage loading fails',async()=>{
    io.load.mockRejectedValueOnce(Error('disk inaccessible'));
    await act(async()=>root.render(<App/>));
    expect(io.persist).not.toHaveBeenCalled();
    expect(host.textContent).toContain('disk inaccessible');
  });
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

  it("exposes discovered PowerShell, but blocks unknown shell effects before an ADI plan",async()=>{
    io.stream.mockResolvedValueOnce([{id:"search",name:"ToolSearch",arguments:'{"query":"select:PowerShell"}'}]).mockImplementationOnce(async request=>{
      expect(request.tools.map((tool:{function:{name:string}})=>tool.function.name)).toContain("PowerShell");
      return [{id:"ps",name:"PowerShell",arguments:'{"command":"Write-Output hello"}'}];
    }).mockResolvedValue([]);
    io.execute.mockResolvedValue({text:"hello",artifact:{kind:"terminal",stdout:"hello",status:"completed",exitCode:0}});
    await send();
    await vi.waitFor(()=>expect(thought().status).toBe("failed"),{timeout:10000});
    const permission=io.view!.thread.messages.find(message=>message.role==="permission")!;
    expect(permission).toBeUndefined();
    expect(io.execute.mock.calls.some(([tool])=>tool.name==="PowerShell")).toBe(false);
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
    expect(thought()).toMatchObject({status:"working",label:"Waiting for approval…",pausedAt:expect.any(Number)});
    const id=thought().id;
    const permission=io.view!.thread.messages.find(message=>message.role==="permission")!;
    await act(async()=>io.view!.onDecide(permission.id,{label:"Allow once",allowed:true,target:"tool",duration:"once"}));
    expect(thought()).toMatchObject({id,label:"Using tools…",pausedAt:undefined});
    const tasks=()=>taskRepository.snapshot(workspaceRuleKey("A:/taro","taro")).tasks;
    const originalTasks=tasks();
    await act(async()=>finishTool({text:"Edited a.ts",artifact:{kind:"edit",path:"a.ts",before:"old",after:"new"}}));
    expect(thought()).toMatchObject({id,status:"working",label:"Thinking…"});
    await act(async()=>finishStream([]));
    expect(getUsageMetricsSnapshot()).toMatchObject({totalMessages:1,totalLinesAdded:1});
    expect(thought()).toMatchObject({id,status:"completed"});
    expect(io.view!.thread.messages.filter(message=>message.role==="thought")).toHaveLength(1);
    expect(io.view!.thinking).toBe(false);
    expect(tasks()).toEqual(originalTasks);
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
