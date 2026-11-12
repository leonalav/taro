import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/data/mock";
import type { ToolCall } from "./model-stream";
import { ProfessionalToolRuntime, type RuntimeOptions } from "./professional-runtime";

let serial=0;
const call=(name:string):ToolCall=>({id:`call-${serial++}`,name,arguments:"{}"});
const completedResponse:RuntimeOptions["stream"]=async(_request,delta)=>{delta("Completed inspection.");return [];};
function setup(){
  const emitted:ChatMessage[]=[];
  const native=vi.fn<RuntimeOptions["native"]>().mockImplementation(async(tool,_input,owner)=>tool.name==="Agent"?{text:"Authorized",artifact:{kind:"agent-authorization",workspaceRoot:owner.workspaceRoot}}:tool.name==="EnterPlanMode"?{text:"Planning",artifact:{kind:"plan-mode",path:".taro/plans/test.md"}}:tool.name==="ExitPlanMode"?{text:"Plan",artifact:{kind:"plan",path:".taro/plans/test.md",name:"My plan",markdown:"# My plan",planKind:"Plan"}}:{text:"Read result",artifact:{kind:"read"}});
  const approve=vi.fn<RuntimeOptions["approve"]>().mockResolvedValue(true);
  const stream=vi.fn<RuntimeOptions["stream"]>().mockImplementation(completedResponse);
  const stop=vi.fn().mockResolvedValue(undefined),update=vi.fn();
  const options:RuntimeOptions={sessionId:`test-${serial++}`,workspaceRoot:"A:/test",agentId:"planner",model:{id:"model",label:"Test model",endpoint:"https://example.invalid"},models:[{id:"model",label:"Test model",endpoint:"https://example.invalid"}],plugins:[],native,approve,stream,stopRequest:stop,emit:message=>emitted.push(message),updateChild:update};
  return {runtime:new ProfessionalToolRuntime(options),native,approve,stream,stop,update,emitted,options};
}

describe("callable professional tool runtime",()=>{
  it("starts a clear interface build with the actual relay and exposes collaboration tools without search",()=>{
    const {options}=setup();
    const agents=["Designer","Code","Type & QA"].map(role=>({id:role,name:role,role,model:"model",enabled:true,autonomy:"auto" as const,canWriteCode:true}));
    const runtime=new ProfessionalToolRuntime({...options,agents});
    expect(runtime.definitions().map(tool=>tool.function.name)).toEqual(expect.arrayContaining(["Agent","TaskOutput","EnterPlanMode","DesignJob","ArtifactDesign"]));
    const brief="Build a responsive landing page for the studio using the project design tokens.";
    expect(runtime.kickoff("Do not ask the QA agent to inspect a.ts.")).toBeUndefined();
    expect(runtime.kickoff("Build the dashboard we discussed.")).toBeUndefined();
    expect(runtime.kickoff("Build a dashboard and ask me before delegating.")).toBeUndefined();
    expect(runtime.kickoff(brief,{hasReferences:true})).toBeUndefined();
    expect(runtime.instructions()).toContain("Inspect the supplied references");
    const kickoff=runtime.kickoff(brief);
    expect(kickoff?.name).toBe("DesignJob");
    expect(JSON.parse(kickoff!.arguments)).toMatchObject({action:"start",brief});
    expect(runtime.kickoff(brief)).toBeUndefined();
  });
  it("keeps questions and explicit opt-outs out of the relay, and loads tokens when the team is unavailable",()=>{
    const {options}=setup();
    const runtime=new ProfessionalToolRuntime(options);
    expect(runtime.kickoff("How would you build a landing page?")).toBeUndefined();
    expect(runtime.kickoff("Build a dashboard, but don't use subagents.")).toMatchObject({name:"ArtifactDesign"});
    const next=new ProfessionalToolRuntime({...options,sessionId:"workflow-fallback"});
    expect(next.kickoff("Implement a responsive dashboard.")).toMatchObject({name:"ArtifactDesign"});
  });
  it("turns an explicit delegation request into a real configured child run",async()=>{
    const {options,emitted}=setup();
    const runtime=new ProfessionalToolRuntime({...options,agents:[{id:"qa",name:"Theo",role:"Type & QA",model:"model",enabled:true,autonomy:"auto",canWriteCode:false}]});
    const kickoff=runtime.kickoff("Ask the QA agent to inspect the existing layout.");
    expect(kickoff?.name).toBe("Agent");
    await runtime.execute(kickoff!,JSON.parse(kickoff!.arguments));
    expect(emitted).toContainEqual(expect.objectContaining({role:"subagent",subagentType:"Type & QA"}));
  });
  it('makes public web reads available without a workspace or mutation approval',async()=>{
    const {options,native,approve}=setup();const runtime=new ProfessionalToolRuntime({...options,workspaceRoot:''});
    expect(runtime.definitions().map(t=>t.function.name)).toEqual(expect.arrayContaining(['WebSearch','WebFetch']));
    await runtime.execute(call('WebSearch'),{query:'css'});await runtime.execute(call('WebFetch'),{url:'https://example.com'});
    expect(native.mock.calls.map(([tool])=>tool.name)).toEqual(['WebSearch','WebFetch']);expect(approve).not.toHaveBeenCalled();
  });
  it('allows Explore children to search and read and publishes typed source status',async()=>{
    const {runtime,native,stream,update}=setup();
    native.mockImplementation(async(tool,_input,owner)=>tool.name==='Agent'?{text:'Authorized',artifact:{kind:'agent-authorization',workspaceRoot:owner.workspaceRoot}}:tool.name==='WebSearch'?{text:'Results',artifact:{kind:'web-search',query:'css',sources:[{url:'https://example.com/a',title:'A'}]}}:{text:'Page',artifact:{kind:'web-fetch',requestedUrl:'https://example.com/a',finalUrl:'https://example.com/a',title:'A',content:'text'}});
    stream.mockResolvedValueOnce([{id:'s',name:'WebSearch',arguments:'{"query":"css"}'},{id:'f',name:'WebFetch',arguments:'{"url":"https://example.com/a"}'}]).mockImplementationOnce(async(_request,delta)=>{delta('Read source.');return [];});
    await runtime.execute(call('Agent'),{description:'Research',prompt:'Search and read',subagent_type:'Explore'});
    const activities=update.mock.calls.map(([,p])=>p.activities).filter(Boolean).at(-1)!;
    expect(activities[0].web.sources[0].read).toBe(true);
    expect(native.mock.calls.find(([tool])=>tool.name==='WebFetch')?.[2].readOnly).toBe(true);
  });
  it("loads schemas through ToolSearch without executing tools",async()=>{
    const {runtime,native}=setup();
    await runtime.execute(call("ToolSearch"),{query:"select:PowerShell,LSP"});
    expect(runtime.definitions().map(tool=>tool.function.name)).toEqual(expect.arrayContaining(["PowerShell","LSP"]));expect(native).not.toHaveBeenCalled();
  });
  it("requires approval for PowerShell and LSP without changing native approval flags",async()=>{
    const {runtime,approve,native}=setup();approve.mockResolvedValueOnce(false);
    await expect(runtime.execute(call("PowerShell"),{command:"Write-Output hi"})).rejects.toThrow(/denied/);
    expect(native).not.toHaveBeenCalled();
    await runtime.execute(call("LSP"),{operation:"hover",filePath:"a.ts",line:1,character:1});
    expect(native.mock.calls[0][3]).toBe(true);
  });
  it("emits the actual plan before approval and keeps restrictions after denial",async()=>{
    const {runtime,approve,native,emitted}=setup();
    await runtime.execute(call("EnterPlanMode"),{});
    approve.mockImplementationOnce(async()=>{expect(emitted.at(-1)).toMatchObject({role:"plan",name:"My plan",markdown:"# My plan"});return false;});
    await expect(runtime.execute(call("ExitPlanMode"),{})).rejects.toThrow(/remains active/);
    expect(runtime.instructions()).toContain("PLAN MODE");
    await expect(runtime.execute(call("PowerShell"),{command:"echo unsafe"})).rejects.toThrow(/plan mode/);
    expect(native.mock.calls.filter(([tool])=>tool.name==="ExitPlanMode")).toHaveLength(1);
    await runtime.execute(call("ExitPlanMode"),{});
    expect(runtime.instructions()).not.toContain("PLAN MODE");
  });
  it("executes a separate Explore model/tool loop with native read-only scope",async()=>{
    const {runtime,stream,native,emitted,update}=setup();
    stream.mockResolvedValueOnce([{id:"read",name:"Read",arguments:'{"file_path":"a.ts"}'}]).mockImplementationOnce(async(_request,delta)=>{delta("Found the definition.");return [];});
    const output=await runtime.execute(call("Agent"),{description:"Find definition",prompt:"Inspect a.ts",subagent_type:"Explore"});
    expect(output.text).toBe("Found the definition.");
    expect(native.mock.calls.find(([tool])=>tool.name==="Read")?.[2]).toMatchObject({readOnly:true,depth:1});
    expect(emitted.find(message=>message.role==="subagent")).toMatchObject({status:"running",subagentType:"Explore"});
    expect(update).toHaveBeenLastCalledWith(expect.any(String),expect.objectContaining({status:"completed"}));
  });
  it("retrieves and stops a real pending child loop without mixing chat scopes",async()=>{
    const {runtime,stream,stop,options}=setup();
    stream.mockImplementation(()=>new Promise(()=>{}));
    const launched=await runtime.execute(call("Agent"),{description:"Inspect files",prompt:"Inspect",run_in_background:true});
    const id=launched.artifact.task_id;
    expect(runtime.instructions()).toContain(String(id));
    expect(new ProfessionalToolRuntime(options).instructions()).toContain(String(id));
    const pending=await runtime.execute(call("TaskOutput"),{task_id:id,block:false});
    expect(pending.artifact.retrieval_status).toBe("not_ready");
    const other=setup();await expect(other.runtime.execute(call("TaskStop"),{task_id:id})).rejects.toThrow(/No task found/);
    const moved=new ProfessionalToolRuntime({...options,workspaceRoot:"A:/different-workspace"});
    await expect(moved.execute(call("TaskOutput"),{task_id:id,block:false})).rejects.toThrow(/No task found/);
    await runtime.execute(call("TaskStop"),{task_id:id});
    expect(stop).toHaveBeenCalled();
    const stopped=await runtime.execute(call("TaskOutput"),{task_id:id,block:false});
    expect(stopped.artifact.task).toMatchObject({status:"stopped"});
  });
  it("runs forked skills as read-only agents during planning",async()=>{
    const {runtime,native,stream,emitted}=setup();
    native.mockImplementation(async(tool,_input,owner)=>tool.name==="EnterPlanMode"?{text:"Planning",artifact:{kind:"plan-mode",path:"plan.md"}}:tool.name==="Skill"?{text:"Inspect this project",artifact:{kind:"skill",context:"fork",allowedTools:["Read","LSP"]}}:{text:"Authorized",artifact:{kind:"agent-authorization",workspaceRoot:owner.workspaceRoot}});
    stream.mockImplementation(async(_request,delta)=>{delta("Inspection complete");return [];});
    await runtime.execute(call("EnterPlanMode"),{});
    await expect(runtime.execute(call("Skill"),{skill:"review"})).resolves.toMatchObject({text:"Inspection complete"});
    expect(emitted.find(message=>message.role==="subagent")).toMatchObject({subagentType:"Explore"});
  });
  it("blocks an already-running writable child after its parent enters plan mode",async()=>{
    const {runtime,stream,approve,native}=setup();
    let allowWrite!:(allowed:boolean)=>void;
    approve.mockImplementation(()=>new Promise(resolve=>{allowWrite=resolve;}));
    stream.mockResolvedValueOnce([{id:"write",name:"Write",arguments:'{"file_path":"a.ts","content":"unsafe"}'}]).mockImplementation(completedResponse);
    const launched=await runtime.execute(call("Agent"),{description:"Update file",prompt:"Update a.ts",run_in_background:true});
    for(let i=0;i<8&&!allowWrite;i++)await Promise.resolve();
    expect(allowWrite).toBeDefined();
    await runtime.execute(call("EnterPlanMode"),{});
    allowWrite(true);
    await runtime.execute(call("TaskOutput"),{task_id:launched.artifact.task_id,block:true,timeout:1000});
    expect(native.mock.calls.some(([tool])=>tool.name==="Write")).toBe(false);
  });
  it("lets the root chat manage nested background children and cascades parent stop",async()=>{
    const {runtime,stream,emitted}=setup();
    stream.mockImplementation(async request=>{
      const messages=request.messages as {role:string;content?:string}[];
      if(messages.find(message=>message.role==="user")?.content==="parent"&&!messages.some(message=>message.role==="tool"))return [{id:"spawn",name:"Agent",arguments:JSON.stringify({description:"Nested child",prompt:"nested",run_in_background:true})}];
      return new Promise(()=>{});
    });
    const parent=await runtime.execute(call("Agent"),{description:"Parent child",prompt:"parent",run_in_background:true});
    for(let i=0;i<20&&emitted.filter(message=>message.role==="subagent").length<2;i++)await Promise.resolve();
    const children=emitted.filter(message=>message.role==="subagent");expect(children).toHaveLength(2);
    await expect(runtime.execute(call("TaskOutput"),{task_id:children[1].childId,block:false})).resolves.toMatchObject({artifact:{retrieval_status:"not_ready"}});
    await runtime.execute(call("TaskStop"),{task_id:parent.artifact.task_id});
    const nested=await runtime.execute(call("TaskOutput"),{task_id:children[1].childId,block:false});
    expect(nested.artifact.task).toMatchObject({status:"stopped"});
  });
  it("keeps child shell tasks accessible to the root and stops them with their child",async()=>{
    const {runtime,stream,native,options}=setup();
    let shellStatus="running";
    native.mockImplementation(async(tool,_input,owner)=>tool.name==="Agent"?{text:"Authorized",artifact:{kind:"agent-authorization",workspaceRoot:owner.workspaceRoot}}:tool.name==="PowerShell"?{text:"Started",artifact:{kind:"terminal",task_id:"shell-child-test",backgroundTaskId:"shell-child-test",status:"running"}}:["TaskStop","StopChildTasks"].includes(tool.name)?(shellStatus="stopped",{text:"Stopped",artifact:{kind:"task-stop",task_id:"shell-child-test"}}):{text:"Output",artifact:{kind:"task-output",retrieval_status:"success",task:{status:shellStatus,output:"child job output"}}});
    stream.mockResolvedValueOnce([{id:"shell",name:"PowerShell",arguments:'{"command":"Start-Sleep 30","run_in_background":true}'}]).mockImplementation(()=>new Promise(()=>{}));
    const child=await runtime.execute(call("Agent"),{description:"Background work",prompt:"Run a job",run_in_background:true});
    for(let i=0;i<30&&!native.mock.calls.some(([tool])=>tool.name==="PowerShell");i++)await Promise.resolve();
    for(let i=0;i<8;i++)await Promise.resolve();
    const output=await runtime.execute(call("TaskOutput"),{task_id:"shell-child-test",block:false});
    expect(new ProfessionalToolRuntime(options).instructions()).toContain("shell-child-test");
    expect(output.artifact.task).toMatchObject({output:"child job output"});
    expect(native.mock.calls.find(([tool])=>tool.name==="TaskOutput")?.[2].sessionId).not.toBe(options.sessionId);
    const moved=new ProfessionalToolRuntime({...options,workspaceRoot:"A:/unrelated"});
    await expect(moved.execute(call("TaskOutput"),{task_id:"shell-child-test",block:false})).rejects.toThrow(/No task found/);
    await runtime.execute(call("TaskStop"),{task_id:child.artifact.task_id});
    expect(shellStatus).toBe("stopped");
  });
});

// A role's write permission must survive delegation, skills, and tool discovery.
describe("configured roles and skills",()=>{
  const role=(id:string,extra:Record<string,unknown>={})=>({id,name:id,role:id,model:"other",enabled:true,autonomy:"auto" as const,canWriteCode:true,...extra});
  it("denies disabled root agents before native calls",async()=>{
    const s=setup();const runtime=new ProfessionalToolRuntime({...s.options,agents:[role("planner",{enabled:false})]});
    await expect(runtime.execute(call("Read"),{})).rejects.toThrow(/disabled/);expect(s.native).not.toHaveBeenCalled();
  });
  it("uses configured role model and carries role instructions into the child",async()=>{
    const s=setup();const runtime=new ProfessionalToolRuntime({...s.options,agents:[role("code")],models:[...s.options.models,{id:"other",label:"Other model",endpoint:"https://other.invalid"}]});
    await runtime.execute(call("Agent"),{description:"Implement",prompt:"Build",subagent_type:"Code"});
    expect(s.stream.mock.calls[0][0]).toMatchObject({credentialId:"other",endpoint:"https://other.invalid"});
    expect(JSON.stringify(s.stream.mock.calls[0][0].messages)).toContain("Role: code");
  });
  it("keeps suggest roles read-only and prevents granting write authority by delegation",async()=>{
    const s=setup();const runtime=new ProfessionalToolRuntime({...s.options,agents:[role("planner",{autonomy:"suggest"}),role("code")],models:[...s.options.models,{id:"other",label:"Other",endpoint:"https://other.invalid"}]});
    await expect(runtime.execute(call("Write"),{})).rejects.toThrow(/read-only|unavailable/);
    s.stream.mockResolvedValueOnce([{id:"bad",name:"Write",arguments:"{}"}]).mockImplementation(completedResponse);
    await runtime.execute(call("Agent"),{description:"Implement",prompt:"Build",subagent_type:"Code"});
    expect(s.native.mock.calls.some(([tool])=>tool.name==="Write")).toBe(false);
  });
  it("requires ask-role delegation approval and never skips normal approvals for auto",async()=>{
    const s=setup();const runtime=new ProfessionalToolRuntime({...s.options,agents:[role("planner",{autonomy:"ask"}),role("code")],models:[...s.options.models,{id:"other",label:"Other",endpoint:"https://other.invalid"}]});
    s.approve.mockResolvedValueOnce(false);
    await expect(runtime.execute(call("Agent"),{description:"Implement",prompt:"Build",subagent_type:"Code"})).rejects.toThrow(/denied/);
    expect(s.stream).not.toHaveBeenCalled();
  });
  it("denies disabled skills and filters them from discovery",async()=>{
    const s=setup();const runtime=new ProfessionalToolRuntime({...s.options,skills:[{id:"review",label:"Review",path:"A:/test/.taro/skills/review/SKILL.md",source:"custom",enabled:false}]});
    await expect(runtime.execute(call("Skill"),{skill:"review"})).rejects.toThrow(/disabled/);
    s.native.mockResolvedValueOnce({text:"Skills review, other",artifact:{kind:"skill-list",skills:[{skill:"review"},{skill:"other"}]}});
    const out=await runtime.execute(call("Skill"),{skill:"list"});expect(out.artifact.skills).toEqual([{skill:"other"}]);expect(out.text).not.toContain("review");
  });
  it("root cancellation stops background children while preserving partial output",async()=>{
    const s=setup();s.stream.mockImplementation(async(_r,delta)=>{delta("partial");return new Promise(()=>{});});
    const child=await s.runtime.execute(call("Agent"),{description:"Job",prompt:"Inspect",run_in_background:true});s.runtime.stop();
    await Promise.resolve();expect(s.update).toHaveBeenCalledWith(child.artifact.task_id,expect.objectContaining({status:"stopped",result:"partial"}));
  });
});

describe("owned child lifecycle",()=>{
  it("waits for background children before completing the owning task",async()=>{
    const s=setup();let finish!:()=>void;s.stream.mockImplementation((_request,delta)=>new Promise(resolve=>{finish=()=>{delta("Inspection finished.");resolve([]);};}));
    await s.runtime.execute(call("Agent"),{description:"Work",prompt:"Inspect",run_in_background:true});
    let settled=false;const wait=s.runtime.settleChildren().then(()=>{settled=true;});await Promise.resolve();expect(settled).toBe(false);finish();await wait;expect(settled).toBe(true);
  });
  it("reports failed background children and stops all child scopes",async()=>{
    const s=setup();s.stream.mockRejectedValue(new Error("provider unavailable"));
    await s.runtime.execute(call("Agent"),{description:"Work",prompt:"Inspect",run_in_background:true});
    await expect(s.runtime.settleChildren()).rejects.toThrow(/provider unavailable/);await s.runtime.stopAll();expect(s.native.mock.calls.some(([tool])=>tool.name==="StopChildTasks")).toBe(true);
  });
});

describe("configured delegation cannot bypass role policy",()=>{
  it("does not use legacy general-purpose delegation to bypass a disabled Code role",async()=>{
    const s=setup();const runtime=new ProfessionalToolRuntime({...s.options,agents:[{id:"code",name:"Rin",role:"Code agent",model:"model",enabled:false,autonomy:"auto",canWriteCode:true}]});
    await expect(runtime.execute(call("Agent"),{description:"Build",prompt:"Build",subagent_type:"general-purpose"})).rejects.toThrow(/disabled/);expect(s.stream).not.toHaveBeenCalled();
  });
  it("intersects nested fork skill tools with its parent's tool allowance",async()=>{
    const s=setup();s.native.mockImplementation(async(tool,_input,owner)=>tool.name==="Skill"?{text:"Inspect",artifact:{kind:"skill",context:"fork",allowedTools:["Skill","Agent"]}}:{text:"Scope",artifact:{kind:"agent-authorization",workspaceRoot:owner.workspaceRoot}});
    s.stream.mockResolvedValueOnce([{id:"spawn",name:"Agent",arguments:JSON.stringify({description:"Nested",prompt:"nested"})}]).mockImplementation(completedResponse);
    await s.runtime.execute(call("Skill"),{skill:"outer"});const nested=s.stream.mock.calls.find(([request])=>(request.messages as {role:string;content:string}[]).some(message=>message.role==="user"&&message.content==="nested"));
    expect(JSON.stringify(nested?.[0].tools)).not.toContain('"name":"Write"');
  });
});

describe("skill policy normalization",()=>{
  it("does not bypass disabled skills by adding whitespace accepted by native parsing",async()=>{
    const s=setup();const runtime=new ProfessionalToolRuntime({...s.options,skills:[{id:"review",label:"Review",source:"custom",enabled:false}]});
    await expect(runtime.execute(call("Skill"),{skill:" review "})).rejects.toThrow(/disabled/);expect(s.native).not.toHaveBeenCalled();
  });
});

describe("configured runtime context",()=>{
  it("lists enabled configured roles and workspace skill candidates with models and capabilities",()=>{
    const s=setup();const runtime=new ProfessionalToolRuntime({...s.options,agents:[{id:"code",name:"Rin",role:"Code agent",model:"model",enabled:true,autonomy:"ask",canWriteCode:true},{id:"hidden",name:"Disabled role",role:"Designer",model:"model",enabled:false,autonomy:"auto",canWriteCode:false}],skills:[{id:"review",label:"Review",description:"Check real changes",source:"custom",path:"A:\\test\\.taro\\skills\\review\\SKILL.md",enabled:true},{id:"hidden-skill",label:"Hidden skill",source:"custom",path:"A:/test/.taro/skills/hidden-skill/SKILL.md",enabled:false}]});
    const context=runtime.instructions();expect(context).toContain('"id":"code"');expect(context).toContain('"model":"model"');expect(context).toContain('"canWriteCode":true');expect(context).toContain('"autonomy":"ask"');expect(context).toContain('Check real changes');expect(context).not.toContain('Disabled role');expect(context).not.toContain('Hidden skill');expect(context).toMatch(/verif/i);
  });
  it("does not advertise external, missing-path or traversing skills as workspace skills",()=>{
    const s=setup();const runtime=new ProfessionalToolRuntime({...s.options,skills:[{id:"outside",label:"External private skill",source:"custom",path:"A:/elsewhere/.taro/skills/private/SKILL.md",enabled:true},{id:"fake",label:"Invented skill",source:"builtin",enabled:true},{id:"escape",label:"Traversing skill",source:"custom",path:"A:/test/.taro/skills/../../outside/SKILL.md",enabled:true}]});
    expect(runtime.instructions()).not.toMatch(/External private|Invented skill|Traversing skill/);
  });
});

describe("cleanup failure isolation",()=>{
  it("still cancels root shell tasks when a child scope cancellation fails",async()=>{
    const s=setup();s.stream.mockImplementation(()=>new Promise(()=>{}));
    await s.runtime.execute(call("Agent"),{description:"Child",prompt:"Inspect",run_in_background:true});
    s.native.mockImplementation(async(tool,_input,owner)=>{if(tool.name==="StopChildTasks"&&owner.depth>0)throw Error("Child scope unavailable");return {text:"Stopped",artifact:{kind:"task-stop"}};});
    await expect(s.runtime.stopAll()).rejects.toThrow(/Child scope unavailable/);
    expect(s.native.mock.calls.some(([tool,,owner])=>tool.name==="StopChildTasks"&&owner.depth===0)).toBe(true);
  });
});

describe("durable child responses",()=>{
  it("publishes partial child text before the request finishes",async()=>{
    const s=setup();s.stream.mockImplementation(async(_r,delta)=>{delta("Durable partial child response");return new Promise(()=>{});});
    const launched=await s.runtime.execute(call("Agent"),{description:"Inspect",prompt:"Inspect",run_in_background:true});
    expect(s.update).toHaveBeenCalledWith(launched.artifact.task_id,expect.objectContaining({result:"Durable partial child response"}));
    await s.runtime.stopAll();
  });
  it("retains complete child text across tool rounds without truncating durable output",async()=>{
    const s=setup();const first="x".repeat(100100);
    s.stream.mockImplementationOnce(async(_r,delta)=>{delta(first);return [{id:"read",name:"Read",arguments:"{}"}];}).mockImplementationOnce(async(_r,delta)=>{delta("Final finding");return [];});
    const out=await s.runtime.execute(call("Agent"),{description:"Inspect",prompt:"Inspect"});
    expect(out.text.length).toBe(first.length+"\n\nFinal finding".length);expect(out.text.startsWith(first)).toBe(true);expect(out.text.endsWith("\n\nFinal finding")).toBe(true);expect(s.update).toHaveBeenLastCalledWith(expect.any(String),expect.objectContaining({result:out.text,status:"completed"}));
  });
  it("fails an empty child provider response instead of reporting completion",async()=>{
    const s=setup();s.stream.mockImplementation(async()=>[]);
    await expect(s.runtime.execute(call("Agent"),{description:"Inspect",prompt:"Inspect"})).rejects.toThrow(/empty response/i);
    expect(s.update).toHaveBeenLastCalledWith(expect.any(String),expect.objectContaining({status:"failed"}));
  });
});
