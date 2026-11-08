import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/data/mock";
import type { ToolCall } from "./model-stream";
import { ProfessionalToolRuntime, type RuntimeOptions } from "./professional-runtime";

let serial=0;
const call=(name:string):ToolCall=>({id:`call-${serial++}`,name,arguments:"{}"});
function setup(){
  const emitted:ChatMessage[]=[];
  const native=vi.fn<RuntimeOptions["native"]>().mockImplementation(async(tool,_input,owner)=>tool.name==="Agent"?{text:"Authorized",artifact:{kind:"agent-authorization",workspaceRoot:owner.workspaceRoot}}:tool.name==="EnterPlanMode"?{text:"Planning",artifact:{kind:"plan-mode",path:".taro/plans/test.md"}}:tool.name==="ExitPlanMode"?{text:"Plan",artifact:{kind:"plan",path:".taro/plans/test.md",name:"My plan",markdown:"# My plan",planKind:"Plan"}}:{text:"Read result",artifact:{kind:"read"}});
  const approve=vi.fn<RuntimeOptions["approve"]>().mockResolvedValue(true);
  const stream=vi.fn<RuntimeOptions["stream"]>().mockResolvedValue([]);
  const stop=vi.fn().mockResolvedValue(undefined),update=vi.fn();
  const options:RuntimeOptions={sessionId:`test-${serial++}`,workspaceRoot:"A:/test",agentId:"planner",model:{id:"model",label:"Test model",endpoint:"https://example.invalid"},models:[{id:"model",label:"Test model",endpoint:"https://example.invalid"}],plugins:[],native,approve,stream,stopRequest:stop,emit:message=>emitted.push(message),updateChild:update};
  return {runtime:new ProfessionalToolRuntime(options),native,approve,stream,stop,update,emitted,options};
}

describe("callable professional tool runtime",()=>{
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
    stream.mockResolvedValueOnce([{id:"write",name:"Write",arguments:'{"file_path":"a.ts","content":"unsafe"}'}]).mockResolvedValue([]);
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
