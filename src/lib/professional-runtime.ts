import type { ChatMessage, ToolActivity } from "@/data/mock";
import type { AgentConfig, SkillConfig, CustomModel } from "@/data/settings";
import type { McpConfig, ToolOutput } from "./agent-tools";
import { activityFromTool, approvalRequired, isInspectionBash, toolKind, toolLabel } from "./agent-tools";
import type { ToolCall } from "./model-stream";
import { DeferredToolCatalog, readOnlyTools } from "./phase-two-catalog";
import {boundedModelContext} from "./model-context";

type SubagentMessage=Extract<ChatMessage,{role:"subagent"}>;
export interface ToolOwner {sessionId:string;workspaceRoot:string;readOnly:boolean;depth:number;childId?:string;roleId?:string;groupId?:string;signal:AbortSignal;ancestors?:{workspaceRoot:string;sessionId:string}[]}
export interface ToolApproval {owner:ToolOwner;force?:boolean;plan?:{name:string;path:string;markdown:string}}
export interface RuntimeOptions {
  sessionId:string;workspaceRoot:string;agentId:string;model:CustomModel;models:CustomModel[];plugins:McpConfig[];
  rules?:string;
  agents?:AgentConfig[];skills?:SkillConfig[];
  native:(call:ToolCall,input:Record<string,unknown>,owner:ToolOwner,approved:boolean,requestId:string)=>Promise<ToolOutput>;
  stream:(request:{requestId:string;endpoint:string;model:string;credentialId:string;messages:unknown[];tools?:unknown[]},onDelta:(text:string)=>void)=>Promise<ToolCall[]>;
  stopRequest:(requestId:string)=>Promise<unknown>;
  approve:(call:ToolCall,input:Record<string,unknown>,request:ToolApproval)=>Promise<boolean>;
  emit:(message:ChatMessage)=>void;
  updateChild:(childId:string,patch:Partial<SubagentMessage>)=>void;
}
interface SessionState {catalog:DeferredToolCatalog;allowedTools?:ReadonlySet<string>;planPath?:string;worktreeRoot?:string}
interface ChildTask {
  id:string;root:string;rootSessionId:string;parentSessionId:string;owner:ToolOwner;controller:AbortController;
  description:string;prompt:string;status:"running"|"completed"|"failed"|"stopped";output:string;error?:string;
  requests:Set<string>;done:Promise<void>;activities:ToolActivity[];model:string;
  stopping?:Promise<void>;
}
interface NativeTaskScope {owner:ToolOwner;root:string;rootSessionId:string}
const sessions=new Map<string,SessionState>();
const childTasks=new Map<string,ChildTask>();
const nativeTasks=new Map<string,NativeTaskScope>();
let sequence=0;
const uid=(prefix:string)=>`${prefix}-${Date.now().toString(36)}-${sequence++}`;
const stateKey=(owner:Pick<ToolOwner,"workspaceRoot"|"sessionId">)=>`${owner.workspaceRoot}\0${owner.sessionId}`;
const stopped=()=>Error("Tool execution stopped");
const result=(text:string,artifact:ToolOutput["artifact"]):ToolOutput=>({text,artifact});

async function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)throw stopped();
  let listener:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{listener=()=>reject(stopped());signal.addEventListener("abort",listener,{once:true});});
  try{return await Promise.race([promise,cancelled]);}finally{signal.removeEventListener("abort",listener);}
}

/** The model-facing orchestration layer; native code still enforces OS boundaries. */
export class ProfessionalToolRuntime {
  private controller=new AbortController();
  private rootOwner:ToolOwner;
  private foreground=new Set<ChildTask>();
  private launched=new Set<ChildTask>();
  private launchedShells=new Set<string>();
  private mcpCatalog:string[]=[];
  constructor(private readonly options:RuntimeOptions){
    const role=options.agents?.find(agent=>agent.id===options.agentId);
    this.rootOwner={sessionId:options.sessionId,workspaceRoot:options.workspaceRoot,roleId:role?.id,readOnly:!!role&&(!role.canWriteCode||role.autonomy==="suggest"),depth:0,signal:this.controller.signal};
    this.state(this.rootOwner).catalog=new DeferredToolCatalog(this.rootOwner.readOnly);
  }
  private state(owner:ToolOwner){
    const key=stateKey(owner);let state=sessions.get(key);
    if(!state){state={catalog:new DeferredToolCatalog(owner.readOnly)};sessions.set(key,state);}return state;
  }
  definitions(){return this.role(this.rootOwner)?.enabled===false?[]:this.state(this.rootOwner).catalog.definitions();}
  private skillDisabled(name:string){return this.options.skills?.some(skill=>!skill.enabled&&[skill.id,skill.label,skill.path?.replace(/\\/g,"/").split("/").at(-2)].includes(name.trim()))??false;}
  private role(owner:ToolOwner){return this.options.agents?.find(agent=>agent.id===owner.roleId);}
  private registry(owner:ToolOwner){
    const agents=this.options.agents?.filter(agent=>agent.enabled).slice(0,16).map(agent=>({id:agent.id,name:agent.name.slice(0,80),role:agent.role.slice(0,100),model:agent.model,modelConfigured:this.options.models.some(model=>model.id===agent.model||model.label===agent.model),autonomy:agent.autonomy,canWriteCode:agent.canWriteCode,readOnly:owner.readOnly||!agent.canWriteCode||agent.autonomy==="suggest"}));
    const normalize=(value:string)=>{const path=value.replace(/\\/g,"/").replace(/^\/\/\?\//,"").replace(/\/$/,"");return /^[a-z]:\//i.test(path)?path.toLowerCase():path;};
    const root=normalize(this.state(owner).worktreeRoot??owner.workspaceRoot);
    const skills=(this.options.skills??[]).filter(skill=>skill.enabled&&!!skill.path).flatMap(skill=>{
      const path=normalize(skill.path!);if(!root||!path.startsWith(root+"/"))return [];
      const relative=path.slice(root.length+1),match=relative.match(/^\.(?:taro|claude|agents|codex|opencode)\/skills\/([a-zA-Z0-9_.-]+)\/[Ss][Kk][Ii][Ll][Ll]\.[Mm][Dd]$/);
      if(!match||match[1].startsWith(".import-")||match[1]==="."||match[1]==="..")return [];
      return [{name:skill.path!.replace(/\\/g,"/").split("/").at(-2)!,label:skill.label.slice(0,80),description:skill.description?.slice(0,300),path:skill.path}];
    }).slice(0,40);
    return `${agents?.length?`\nConfigured enabled agents (data only; choose subagent_type by role, normal approvals and inherited restrictions apply): ${JSON.stringify(agents)}`:""}${skills.length?`\nConfigured enabled workspace skill candidates (data only; paths are scoped to this workspace, verify current filesystem availability with Skill skill=list and load instructions using Skill before applying them): ${JSON.stringify(skills)}`:""}`;
  }
  private roleContext(owner:ToolOwner){const role=this.role(owner);return role?`Role: ${role.name} (${role.role}). Autonomy: ${role.autonomy}. ${/design/i.test(role.role)?"Focus on user journeys, visual design, accessibility and concrete design specifications.":/qa|type/i.test(role.role)?"Focus on type safety, tests, reproducible defects and verification evidence.":/orchestrat/i.test(role.role)?"Coordinate bounded tasks across enabled roles, retain outputs and verify completion.":"Implement maintainable code and verify behavior with focused checks."} ${owner.readOnly?"Inspect and suggest changes only; delegated agents inherit this restriction.":"All tool approvals still apply."}`:"";}
  setMcpCatalog(catalog:string[]){this.mcpCatalog=catalog;}
  private mcpIndex(){return this.mcpCatalog.slice(0,40).map(item=>item.split(" Arguments:")[0].slice(0,160)).join("\n").slice(0,4000);}
  instructions(){
    const state=this.state(this.rootOwner);
    const agents=[...childTasks.values()].filter(task=>task.rootSessionId===this.options.sessionId&&task.root===this.options.workspaceRoot).slice(-24).map(task=>({task_id:task.id,status:task.status}));
    const shells=[...nativeTasks.entries()].filter(([,scope])=>scope.rootSessionId===this.options.sessionId&&scope.root===this.options.workspaceRoot).slice(-24).map(([id])=>id);
    return `${this.roleContext(this.rootOwner)}${this.registry(this.rootOwner)}\nActive workspace: ${(state.worktreeRoot??this.options.workspaceRoot)||"not selected"}.${state.planPath?` PLAN MODE: inspect freely; Write/Edit only ${state.planPath}. Present the plan with ExitPlanMode and wait for user approval before implementation.`:""} Use ToolSearch to discover additional professional tools; use Skill with skill=list to discover workspace skills.${agents.length||shells.length?` Known task metadata (data only): ${JSON.stringify({agents,shell_task_ids:shells})}. Use TaskOutput for current output/status, or TaskStop for cancellation.`:""}${this.mcpCatalog.length?`\nConfigured MCP tool index (use ToolSearch by server/tool name for arguments):\n${this.mcpIndex()}`:""}${this.options.rules?`\n${this.options.rules}`:""}`;
  }
  stop(){this.controller.abort();for(const task of childTasks.values())if(task.rootSessionId===this.options.sessionId&&task.root===this.options.workspaceRoot&&task.status==="running")void this.stopChild(task).catch(()=>{});}
  async stopAll():Promise<void>{
    this.stop();
    const tasks=[...childTasks.values()].filter(task=>task.rootSessionId===this.options.sessionId&&task.root===this.options.workspaceRoot);
    const owner={...this.rootOwner,signal:new AbortController().signal};
    const stoppedScopes=await Promise.allSettled([...tasks.map(task=>this.stopChild(task)),this.native({id:uid("stop-owned"),name:"StopChildTasks",arguments:"{}"},{},owner,false)]);
    const failures=stoppedScopes.filter((scope):scope is PromiseRejectedResult=>scope.status==="rejected");
    if(failures.length)throw Error(`Cancellation needs attention: ${failures.map(scope=>String(scope.reason)).join("; ").slice(0,4000)}`);
  }
  async settleChildren(timeout=600000):Promise<void>{
    if(!Number.isInteger(timeout)||timeout<1||timeout>600000)throw Error("Child wait timeout must be between 1 and 600000 ms");
    let timer:ReturnType<typeof setTimeout>|undefined;
    const finish=async()=>{
      // Children may spawn other children while settling; re-read after every completion.
      while(true){const running=[...this.launched].filter(task=>task.status==="running");if(!running.length)break;await Promise.all(running.map(task=>task.done));}
      const failed=[...this.launched].find(task=>task.status==="failed"||task.status==="stopped");
      if(failed)throw Error(failed.error??`Child ${failed.description} ${failed.status}`);
      for(const [id,scope] of nativeTasks){
        if(!this.launchedShells.has(id)||scope.rootSessionId!==this.options.sessionId||scope.root!==this.options.workspaceRoot)continue;
        const out=await this.native({id:uid("settle-shell"),name:"TaskOutput",arguments:"{}"},{task_id:id,block:true,timeout}, {...scope.owner,signal:this.controller.signal},false);
        const task=out.artifact.task as {status?:string;exitCode?:number;exit_code?:number;error?:string}|undefined;
        const exitCode=task?.exitCode??task?.exit_code;
        if(out.artifact.retrieval_status!=="success"||task?.status==="running")throw Error(`Shell task ${id} did not finish before the wait limit`);
        if(task?.status!=="completed"||exitCode!==undefined&&exitCode!==0)throw Error(task?.error??`Shell task ${id} failed`);
      }
    };
    try{await abortable(Promise.race([finish(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Child tasks exceeded the completion wait limit")),timeout);})]),this.controller.signal);}finally{if(timer)clearTimeout(timer);}
  }
  private stopChild(task:ChildTask):Promise<void>{
    if(task.stopping)return task.stopping;
    task.stopping=this.stopChildWork(task).catch(error=>{task.status="failed";task.error=String(error);this.options.updateChild(task.id,{status:"failed",result:`Cancellation could not complete: ${String(error)}`});throw error;});
    return task.stopping;
  }
  private async stopChildWork(task:ChildTask){
    const descendants=[...childTasks.values()].filter(child=>child.parentSessionId===task.owner.sessionId);
    if(task.status==="running"){
      task.controller.abort();task.status="stopped";
      for(const id of task.requests)void this.options.stopRequest(id).catch(()=>{});
      this.options.updateChild(task.id,{status:"stopped",result:task.output||"Child agent stopped."});
    }
    const owner={...task.owner,signal:new AbortController().signal,readOnly:false,ancestors:[],childId:undefined};
    // Native scope cancellation also catches a detached job whose launch result
    // raced cancellation and never reached the frontend task registry.
    await Promise.all([...descendants.map(child=>this.stopChild(child)),this.native({id:uid("stop-child-tasks"),name:"StopChildTasks",arguments:"{}"},{},owner,false)]);
  }
  async execute(call:ToolCall,input:Record<string,unknown>,groupId?:string,requestId=uid("tool")):Promise<ToolOutput>{
    return this.executeFor(call,input,{...this.rootOwner,groupId},requestId);
  }
  private async native(call:ToolCall,input:Record<string,unknown>,owner:ToolOwner,approved:boolean,requestId=uid("tool")){
    if(owner.signal.aborted)throw stopped();
    const readOnlyAgent=call.name==="Agent"&&["Explore","Plan"].includes(String(input.subagent_type))&&!input.isolation;
    if(owner.ancestors?.some(ancestor=>sessions.get(stateKey(ancestor))?.planPath)&&!readOnlyTools.has(call.name)&&!readOnlyAgent)throw Error("This operation is blocked because an ancestor agent is in plan mode");
    const task=owner.childId?childTasks.get(owner.childId):undefined;task?.requests.add(requestId);
    const cancel=()=>{void this.options.stopRequest(requestId).catch(()=>{});};owner.signal.addEventListener("abort",cancel,{once:true});
    try{
      const output=await abortable(this.options.native(call,input,owner,approved,requestId),owner.signal);
      if(output.artifact.kind==="terminal"&&typeof output.artifact.backgroundTaskId==="string"){nativeTasks.set(output.artifact.backgroundTaskId,{owner,root:task?.root??owner.workspaceRoot,rootSessionId:task?.rootSessionId??owner.sessionId});this.launchedShells.add(output.artifact.backgroundTaskId);}
      return output;
    }finally{task?.requests.delete(requestId);owner.signal.removeEventListener("abort",cancel);}
  }
  private async executeFor(call:ToolCall,input:Record<string,unknown>,owner:ToolOwner,requestId=uid("tool")):Promise<ToolOutput>{
    if(owner.signal.aborted)throw stopped();
    const state=this.state(owner);
    if(this.role(owner)?.enabled===false)throw Error("This agent is disabled");
    if(call.name==="Skill"&&String(input.skill??"list").trim()!=="list"&&this.skillDisabled(String(input.skill)))throw Error("This skill is disabled");
    if(!state.catalog.allowed(call.name))throw Error(`${call.name} is unavailable${owner.readOnly?" to this read-only agent":""}.`);
    if(call.name==="ToolSearch"){
      const found=state.catalog.search(String(input.query??""),input.max_results===undefined?5:Number(input.max_results));
      const words=String(input.query??"").toLowerCase().split(/[^a-z0-9_-]+/).filter(word=>word&&word!=="mcp"&&word!=="select");
      const matches=state.catalog.allowed("MCP")?this.mcpCatalog.filter(item=>words.some(word=>item.toLowerCase().includes(word))).slice(0,Math.min(5,Number(input.max_results)||5)):[];
      const mcpTools:string[]=[],oversizedMcpTools:string[]=[];
      let chars=0;
      for(const item of matches){const length=JSON.stringify(item).length;if(chars+length>16000)oversizedMcpTools.push(item.split(" Arguments:")[0].slice(0,160));else{mcpTools.push(item);chars+=length;}}
      const discovery={...found,mcpTools,...(oversizedMcpTools.length?{oversizedMcpTools,note:"Some MCP schemas exceed this discovery budget. Search for one specific tool; do not guess missing arguments."}:{})};
      return result(JSON.stringify(discovery),{kind:"tool-search",...discovery});
    }
    if(state.planPath&&["PowerShell","Bash","MCP","NotebookEdit","EnterWorktree","ExitWorktree"].includes(call.name))throw Error("This operation is blocked in plan mode. Use ExitPlanMode to present the plan for approval first.");
    if(call.name==="Agent")return this.runAgent(input,owner);
    if((call.name==="TaskOutput"||call.name==="TaskStop")&&String(input.task_id??input.shell_id??"").startsWith("agent-"))return this.agentTask(call.name,input,owner);
    if(call.name==="TaskOutput"||call.name==="TaskStop"){
      const scope=nativeTasks.get(String(input.task_id??input.shell_id??""));
      if(scope){
        const direct=scope.owner.sessionId===owner.sessionId&&scope.owner.workspaceRoot===owner.workspaceRoot;
        const root=owner.depth===0&&scope.rootSessionId===owner.sessionId&&scope.root===owner.workspaceRoot;
        const ancestor=scope.owner.ancestors?.some(parent=>parent.sessionId===owner.sessionId&&parent.workspaceRoot===owner.workspaceRoot);
        if(!direct&&!root&&!ancestor)throw Error(`No task found with ID: ${String(input.task_id)}`);
        // A root/ancestor may control its detached job even after the creator stops.
        return this.native(call,input,{...scope.owner,signal:owner.signal,readOnly:owner.readOnly,ancestors:[],childId:undefined},false,requestId);
      }
    }
    if(call.name==="Bash"&&typeof input.command==="string"&&isInspectionBash(input.command))throw Error("Use ListFiles, Glob, Grep, or Read for file inspection instead of Bash.");
    if(call.name==="MCP"&&!this.options.plugins.some(plugin=>plugin.id===input.server))throw Error("MCP server is not configured");
    if(call.name==="ExitPlanMode"){
      const preview=await this.native(call,input,owner,false,requestId);
      this.emitPlan(preview,owner);
      const artifact=preview.artifact;
      const approved=await abortable(this.options.approve(call,input,{owner,force:true,plan:{name:String(artifact.name??"Plan"),path:String(artifact.path??""),markdown:String(artifact.markdown??"")}}),owner.signal);
      if(!approved)throw Error("Plan approval denied. Planning mode remains active.");
      const output=await this.native(call,input,owner,true);
      state.planPath=undefined;
      return output;
    }
    const needsApproval=approvalRequired.has(call.name)||(call.name==="EnterWorktree")||(call.name==="ExitWorktree"&&input.action==="remove");
    const approved=needsApproval?await abortable(this.options.approve(call,input,{owner,force:call.name==="ExitWorktree"&&input.action==="remove"}),owner.signal):false;
    if(needsApproval&&!approved)throw Error("User denied the tool call");
    const output=await this.native(call,input,owner,approved,requestId);
    const artifact=output.artifact;
    if(call.name==="Skill"&&artifact.kind==="skill-list"&&Array.isArray(artifact.skills)){
      const skills=artifact.skills.filter((entry:unknown)=>{const name=String((entry as {skill?:unknown}).skill??"");return !this.skillDisabled(name);});
      return result(skills.length?`Workspace skills: ${skills.map((entry:unknown)=>String((entry as {skill?:unknown}).skill)).join(", ")}`:"No enabled workspace skills found.",{...artifact,skills});
    }
    if(call.name==="EnterPlanMode"){
      state.planPath=String(artifact.path??"");
      this.options.emit({id:uid("plan-mode"),role:"event",text:"Enter plan mode"});
    }
    if(call.name==="EnterWorktree")state.worktreeRoot=String(artifact.worktreePath??artifact.path??owner.workspaceRoot);
    if(call.name==="ExitWorktree")state.worktreeRoot=undefined;
    if(call.name==="Skill"&&artifact.kind==="skill"&&artifact.context==="fork"){
      const allowed=Array.isArray(artifact.allowedTools)?artifact.allowedTools.map(String):undefined;
      const readOnly=owner.readOnly||Boolean(state.planPath)||owner.ancestors?.some(ancestor=>sessions.get(stateKey(ancestor))?.planPath);
      return this.runAgent({description:`Run /${String(input.skill)}`,prompt:output.text,subagent_type:readOnly?"Explore":"general-purpose",model:artifact.model},owner,allowed);
    }
    return output;
  }
  private emitPlan(output:ToolOutput,owner:ToolOwner){
    const artifact=output.artifact;
    if(typeof artifact.markdown!=="string"||!artifact.markdown.trim())throw Error("The plan file is empty or unavailable");
    this.options.emit({id:uid("plan"),role:"plan",agentId:this.options.agentId,kind:artifact.planKind==="Design Plan"?"Design Plan":"Plan",name:String(artifact.name??"Plan"),path:String(artifact.path??""),markdown:artifact.markdown,workspaceRoot:owner.workspaceRoot,sessionId:owner.sessionId});
  }
  private async runAgent(input:Record<string,unknown>,parent:ToolOwner,allowedTools?:string[]):Promise<ToolOutput>{
    if(parent.depth>=2)throw Error("Child-agent nesting limit reached");
    const prompt=String(input.prompt??"").trim(),description=String(input.description??"").trim();
    if(!prompt||!description)throw Error("Agent requires description and prompt");
    if(input.isolation!==undefined&&input.isolation!=="worktree")throw Error("Agent isolation must be worktree");
    if(input.run_in_background!==undefined&&typeof input.run_in_background!=="boolean")throw Error("run_in_background must be a boolean");
    const type=String(input.subagent_type??"general-purpose");
    const canonical=(value:string)=>value.toLowerCase().replace(/ agent$/,"").replace(/[^a-z]/g,"");
    const requestedRole={"general-purpose":"code",Explore:"typeqa",Plan:"designer"}[type];
    const role=this.options.agents?.find(agent=>[agent.id,agent.name,agent.role].some(value=>canonical(value)===canonical(type)))??(requestedRole?this.options.agents?.find(agent=>canonical(agent.role)===requestedRole):undefined);
    if(this.options.agents&&!role)throw Error("Requested agent role is not configured");
    if(!["Explore","Plan","general-purpose"].includes(type)&&!role)throw Error("Unknown or unconfigured subagent_type");
    if(role&&!role.enabled)throw Error("Requested agent is disabled");
    if(role&&input.model&&input.model!==role.model)throw Error("Configured role model cannot be overridden");
    const parentRole=this.role(parent);
    if(parentRole?.autonomy==="ask"||role?.autonomy==="ask"){
      const approved=await abortable(this.options.approve({id:uid("agent-approval"),name:"Agent",arguments:JSON.stringify(input)},input,{owner:parent,force:true}),parent.signal);
      if(!approved)throw Error("User denied delegation");
    }
    const inheritedReadOnly=parent.readOnly||!!role&&(!role.canWriteCode||role.autonomy==="suggest");
    if(inheritedReadOnly&&input.isolation)throw Error("Read-only agents cannot create worktrees");
    const nativeInput={...input,subagent_type:inheritedReadOnly?"Explore":["Explore","Plan"].includes(type)?type:"general-purpose"};
    const access=await this.native({id:uid("agent-scope"),name:"Agent",arguments:JSON.stringify(nativeInput)},nativeInput,parent,false);
    const state=this.state(parent),planning=Boolean(state.planPath)||access.artifact.readOnly===true;
    if(planning&&(!inheritedReadOnly&&!["Explore","Plan"].includes(type)||input.isolation))throw Error("Plan mode allows only read-only Explore or Plan agents without worktree creation");
    const parentTask=parent.childId?childTasks.get(parent.childId):undefined;
    const rootSessionId=parentTask?.rootSessionId??parent.sessionId;
    if([...childTasks.values()].filter(task=>task.rootSessionId===rootSessionId&&task.status==="running").length>=8)throw Error("This chat already has eight running child agents");
    const selectedModel=role?.model??input.model;
    const model=selectedModel?this.options.models.find(model=>model.id===selectedModel||model.label===selectedModel):this.options.model;
    if(!model)throw Error("Agent model must name a configured model");
    if(childTasks.size>=256){const retired=[...childTasks.values()].find(task=>task.status!=="running");if(retired){childTasks.delete(retired.id);sessions.delete(stateKey(retired.owner));}else throw Error("Background agent registry is full");}
    const id=uid("agent"),controller=new AbortController();
    const owner:ToolOwner={sessionId:`${parent.sessionId}:${id}`,workspaceRoot:String(access.artifact.workspaceRoot??state.worktreeRoot??parent.workspaceRoot),roleId:role?.id,readOnly:inheritedReadOnly||planning||type==="Explore"||type==="Plan",depth:parent.depth+1,childId:id,groupId:parent.groupId,signal:controller.signal,ancestors:[...parent.ancestors??[],{workspaceRoot:parent.workspaceRoot,sessionId:parent.sessionId}]};
    const task:ChildTask={id,root:parentTask?.root??parent.workspaceRoot,rootSessionId,parentSessionId:parent.sessionId,owner,controller,description,prompt,status:"running",output:"",requests:new Set(),done:Promise.resolve(),activities:[],model:model.label};
    childTasks.set(id,task);this.launched.add(task);
    const inherited=this.state(parent).allowedTools;
    const permitted=allowedTools?.length?new Set(allowedTools.filter(tool=>!inherited||inherited.has(tool))):inherited;
    sessions.set(stateKey(owner),{catalog:new DeferredToolCatalog(owner.readOnly,permitted),allowedTools:permitted});
    this.options.emit({id:uid("subagent"),role:"subagent",agentId:this.options.agentId,childId:id,subagentType:type,description,prompt,model:model.label,runInBackground:input.run_in_background===true,isolation:input.isolation==="worktree"?"worktree":undefined,status:"running",activities:[]});
    const background=input.run_in_background===true;
    const abort=()=>{void this.stopChild(task).catch(()=>{});};
    if(!background){this.foreground.add(task);parent.signal.addEventListener("abort",abort,{once:true});}
    task.done=this.childLoop(task,model,input.isolation==="worktree").catch(error=>{
      task.status=controller.signal.aborted?"stopped":"failed";task.error=String(error);
      this.options.updateChild(id,{status:task.status,result:task.output||task.error});
    }).finally(()=>{this.foreground.delete(task);parent.signal.removeEventListener("abort",abort);});
    if(background)return result(`Started child agent ${id}. Use TaskOutput or TaskStop with task_id=${id}.`,{kind:"agent",task_id:id,agentId:id,status:"async_launched"});
    await abortable(task.done,parent.signal);
    if(task.status==="failed")throw Error(task.error??"Child agent failed");
    if(task.status==="stopped")throw stopped();
    return result(task.output,{kind:"agent",task_id:id,agentId:id,status:task.status,result:task.output});
  }
  private async childLoop(task:ChildTask,model:CustomModel,isolation:boolean){
    const owner=task.owner;
    if(isolation){
      const call:ToolCall={id:uid("isolate"),name:"EnterWorktree",arguments:"{}"};
      const input={name:task.id};
      const approved=await abortable(this.options.approve(call,input,{owner}),owner.signal);
      if(!approved)throw Error("Agent worktree creation denied");
      const output=await this.native(call,input,{...owner,readOnly:false},true);
      this.state(owner).worktreeRoot=String(output.artifact.worktreePath??owner.workspaceRoot);
    }
    const messages:unknown[]=[{role:"system",content:`You are a Taro child agent. ${this.roleContext(owner)}${this.registry(owner)} Complete only the assigned task. Workspace: ${this.state(owner).worktreeRoot??owner.workspaceRoot}. ${owner.readOnly?"This agent is read-only; inspect and report, do not modify files or run shell commands.":"Use normal user approvals for changes and commands."} Use ToolSearch to discover tools and Skill with skill=list to discover workspace skills. Report exact results; never claim tools succeeded without their result.${this.options.rules?`\n${this.options.rules}`:""}${this.mcpCatalog.length?`\nConfigured MCP tool index (use ToolSearch for arguments):\n${this.mcpIndex()}`:""}`},{role:"user",content:task.prompt}];
    for(let round=0;round<32;round++){
      if(owner.signal.aborted)throw stopped();
      const requestId=uid("child-request");task.requests.add(requestId);let received="",lastPublished=-Infinity;
      const previousOutput=task.output;
      const publish=()=>{task.output=previousOutput+(previousOutput&&received?"\n\n":"")+received;this.options.updateChild(task.id,{result:task.output});};
      let calls:ToolCall[];
      try{calls=await abortable(this.options.stream({requestId,endpoint:model.endpoint,model:model.model||model.label,credentialId:model.id,messages:boundedModelContext(messages),tools:this.state(owner).catalog.definitions()},delta=>{if(!owner.signal.aborted){received+=delta;task.output=previousOutput+(previousOutput&&received?"\n\n":"")+received;if(Date.now()-lastPublished>=120){lastPublished=Date.now();publish();}}}),owner.signal);}finally{task.requests.delete(requestId);if(received)publish();}
      if(!calls.length){if(!received.trim())throw Error("The child agent returned an empty response without a result.");task.status="completed";this.options.updateChild(task.id,{status:"completed",result:task.output});return;}
      messages.push({role:"assistant",content:received||null,tool_calls:calls.map(call=>({id:call.id,type:"function",function:{name:call.name,arguments:call.arguments}}))});
      for(const call of calls){
        if(owner.signal.aborted)throw stopped();
        let input:Record<string,unknown>={};let output:ToolOutput|undefined,error:unknown;const started=Date.now();
        try{const parsed=JSON.parse(call.arguments||"{}");if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")throw Error("Tool arguments must be an object");input=parsed;}catch(caught){error=caught;}
        task.activities.push({id:call.id,kind:toolKind(call.name),label:toolLabel(call.name,input),status:"running"});
        this.options.updateChild(task.id,{activities:[...task.activities]});
        if(!error)try{output=await this.executeFor(call,input,owner);}catch(caught){error=caught;}
        if(owner.signal.aborted)throw stopped();
        const activity=activityFromTool(call,input,output,error,Date.now()-started);
        task.activities=task.activities.map(item=>item.id===call.id?activity:item);
        this.options.updateChild(task.id,{activities:[...task.activities]});
        messages.push({role:"tool",tool_call_id:call.id,content:error?String(error):output?.text.slice(0,20000)??"Completed"});
        if(!error&&output?.artifact.kind==="image"&&output.artifact.dataUrl)messages.push({role:"user",content:[{type:"text",text:`Image read from ${String(output.artifact.path)}`},{type:"image_url",image_url:{url:output.artifact.dataUrl}}]});
      }
    }
    throw Error("Child agent reached the 32-round tool limit");
  }
  private async agentTask(name:string,input:Record<string,unknown>,owner:ToolOwner):Promise<ToolOutput>{
    const id=String(input.task_id??input.shell_id??""),task=childTasks.get(id);
    const workspace=owner.childId?childTasks.get(owner.childId)?.root:owner.workspaceRoot;
    if(!task||task.root!==workspace||!((task.parentSessionId===owner.sessionId)||(owner.depth===0&&task.rootSessionId===owner.sessionId)))throw Error(`No task found with ID: ${id}`);
    if(name==="TaskStop"){
      if(task.status!=="running")throw Error(`Task ${id} is not running (status: ${task.status})`);
      await this.stopChild(task);return result(`Stopped child agent ${id}`,{kind:"task-stop",task_id:id,task_type:"local_agent",status:"stopped",output:task.output});
    }
    const timeout=input.timeout===undefined?30000:Number(input.timeout);
    if(!Number.isInteger(timeout)||timeout<0||timeout>600000)throw Error("timeout must be between 0 and 600000 ms");
    if(input.block!==false&&task.status==="running"&&timeout>0){let timer:ReturnType<typeof setTimeout>|undefined;try{await abortable(Promise.race([task.done,new Promise<void>(resolve=>{timer=setTimeout(resolve,timeout);})]),owner.signal);}finally{if(timer)clearTimeout(timer);}}
    const retrieval=task.status==="running"?(input.block===false?"not_ready":"timeout"):"success";
    const value={task_id:id,task_type:"local_agent",status:task.status,description:task.description,prompt:task.prompt,output:task.output,result:task.output,error:task.error};
    return result(JSON.stringify({retrieval_status:retrieval,task:value}),{kind:"task-output",retrieval_status:retrieval,task:value});
  }
}
