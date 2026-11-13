import type { ChatMessage, ToolActivity } from "@/data/mock";
import {isTauri} from "@tauri-apps/api/core";
import type { AgentConfig, SkillConfig, CustomModel } from "@/data/settings";
import type { McpConfig, ToolOutput } from "./agent-tools";
import { activityFromTool, approvalRequired, isInspectionBash, toolKind, toolLabel } from "./agent-tools";
import type { ToolCall } from "./model-stream";
import { DeferredToolCatalog, readOnlyTools } from "./phase-two-catalog";
import {boundedModelContext} from "./model-context";
import {defaultReviewServices,executeReviewTool,type ReviewServices} from './review-tools';
import {activeRevision,previewById,type ReviewScope} from './review-store';
import {taskRepository} from './task-persistence';
import {completeTask,createTask,type TaskRepository} from './task-store';
import {workspaceRuleKey} from './workspace-preferences';
import {NativeRunLedger} from './foundation-native';
import {approvedDesignIntent,designJobDefinition,designSubmissionDefinition,parseDesignSubmission,type CodeHandoff,type DesignIntent,type DesignJob,type DesignStage,type DesignSubmission,type DesignVerdict} from './design-job';
import {reviewToolNames} from './review-tool-definitions';
import {artifactToolNames,artifactDesignInstructions} from './artifact-tool-definitions';
import {createArtifactDesign} from './artifact-design';
import {roleKey,specialistPlaybook,workflowIntent,type Specialist} from './agent-workflow';
import {executeArtifactTool,type ArtifactServices} from './artifact-tools';
import {webActivity,webLabel,markWebReads,readUrls,settleWebActivities,toolResultText,webInstructions,webToolNames} from './web-research';

type SubagentMessage=Extract<ChatMessage,{role:"subagent"}>;
export interface ToolOwner {sessionId:string;workspaceRoot:string;readOnly:boolean;depth:number;childId?:string;roleId?:string;groupId?:string;signal:AbortSignal;reviewScope?:ReviewScope;ancestors?:{workspaceRoot:string;sessionId:string}[]}
export interface ToolApproval {owner:ToolOwner;force?:boolean;plan?:{name:string;path:string;markdown:string}}
export interface RuntimeOptions {
  tasks?:TaskRepository;
  reviewScope?:ReviewScope;
  artifactServices?:ArtifactServices;
  reviewServices?:ReviewServices;
  sessionId:string;workspaceRoot:string;agentId:string;model:CustomModel;models:CustomModel[];plugins:McpConfig[];
  rules?:string;
  agents?:AgentConfig[];skills?:SkillConfig[];
  native:(call:ToolCall,input:Record<string,unknown>,owner:ToolOwner,approved:boolean,requestId:string)=>Promise<ToolOutput>;
  stream:(request:{requestId:string;endpoint:string;model:string;credentialId:string;messages:unknown[];tools?:unknown[]},onDelta:(text:string)=>void)=>Promise<ToolCall[]>;
  stopRequest:(requestId:string)=>Promise<unknown>;
  approve:(call:ToolCall,input:Record<string,unknown>,request:ToolApproval)=>Promise<boolean>;
  emit:(message:ChatMessage)=>void;
  updateChild:(childId:string,patch:Partial<SubagentMessage>)=>void;
  observeWorkflowTool?:(call:ToolCall,input:Record<string,unknown>,execute:()=>Promise<ToolOutput>)=>Promise<ToolOutput>;
}
interface SessionState {catalog:DeferredToolCatalog;allowedTools?:ReadonlySet<string>;planPath?:string;worktreeRoot?:string}
interface ChildTask {
  id:string;root:string;rootSessionId:string;parentSessionId:string;owner:ToolOwner;controller:AbortController;
  description:string;prompt:string;status:"running"|"completed"|"failed"|"stopped";output:string;error?:string;
  requests:Set<string>;done:Promise<void>;activities:ToolActivity[];model:string;
  stopping?:Promise<void>;
  handoff?:{stage:DesignStage; jobId:string; design?:DesignIntent["design"]; submission?:DesignSubmission; edits?:Map<string,string>; preview?:{previewId:string;revisionId:string}; expectedPreview?:CodeHandoff; auditId?:string; inspected?:boolean; sawAudit?:boolean; assertCurrent?:()=>void};
}
interface NativeTaskScope {owner:ToolOwner;root:string;rootSessionId:string}
const sessions=new Map<string,SessionState>();
const childTasks=new Map<string,ChildTask>();
const nativeTasks=new Map<string,NativeTaskScope>();
const activeDesignJobs=new Map<string,{id:string;stop:()=>Promise<void>}>();
export async function stopWorkspaceDesignJob(workspace:string,id:string){
  const active=activeDesignJobs.get(workspace);
  if(active?.id===id)await active.stop();
}
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
  private remainingRequests=128;
  private designLedger?:NativeRunLedger;
  private workflowStarted=false;
  private delegationDisabled=false;
  private delegationApprovalRequired=false;
  private workflowNote?:string;
  constructor(private readonly options:RuntimeOptions){
    const role=options.agents?.find(agent=>agent.id===options.agentId);
    this.rootOwner={sessionId:options.sessionId,workspaceRoot:options.workspaceRoot,roleId:role?.id,readOnly:!!role&&(!role.canWriteCode||role.autonomy==="suggest"),depth:0,signal:this.controller.signal,reviewScope:options.reviewScope};
    this.state(this.rootOwner).catalog=new DeferredToolCatalog(this.rootOwner.readOnly);
  }
  private state(owner:ToolOwner){
    const key=stateKey(owner);let state=sessions.get(key);
    if(!state){state={catalog:new DeferredToolCatalog(owner.readOnly)};sessions.set(key,state);}return state;
  }
  definitions(){
    if(this.role(this.rootOwner)?.enabled===false)return [];
    const definitions=this.state(this.rootOwner).catalog.definitions();
    if(!this.options.workspaceRoot)return definitions.filter(tool=>reviewToolNames.has(tool.function.name)||webToolNames.has(tool.function.name)||artifactToolNames.has(tool.function.name));
    if(this.delegationDisabled)return definitions.filter(tool=>tool.function.name!=="Agent");
    return [...definitions,designJobDefinition];
  }
  private specialist(type:string){
    const key=roleKey(type);
    return this.options.agents?.find(agent=>[agent.id,agent.name,agent.role].some(value=>roleKey(value)===key));
  }
  private specialistReady(type:Specialist,requiresWrite=false){
    const agent=this.specialist(type);
    return !!agent?.enabled&&this.options.models.some(model=>model.id===agent.model||model.label===agent.model)&&
      (!requiresWrite||agent.canWriteCode&&agent.autonomy!=="suggest");
  }
  kickoff(brief:string,options:{hasReferences?:boolean;taskTitle?:string;inspectBuild?:boolean}={}):ToolCall|undefined{
    if(this.workflowStarted||this.rootOwner.signal.aborted)return;
    const intent=workflowIntent(brief);
    this.delegationDisabled=intent.solo;
    this.delegationApprovalRequired=intent.askBeforeDelegating;
    const titleIntent=options.taskTitle?workflowIntent(options.taskTitle):undefined;
    const designBuild=intent.designBuild||Boolean(titleIntent?.designBuild&&!intent.discussion&&!intent.proposalRequested);
    if(intent.discussion&&!designBuild)return;
    if(intent.askBeforeDelegating){
      this.workflowNote="The user asked to approve delegation before it starts. Ask for that decision before involving a specialist.";
      return;
    }
    if(options.hasReferences||intent.references){
      this.workflowNote="Inspect the supplied references and invoke explicitly requested skills before delegation. Carry their relevant decisions, file paths and constraints into the child or DesignJob brief.";
      return;
    }
    const ready=this.options.workspaceRoot&&!this.rootOwner.readOnly&&!this.state(this.rootOwner).planPath&&
      (["Designer","Code","Type & QA"] as const).every(role=>this.specialistReady(role,role==="Code"));
    const schedule=(name:string,args:Record<string,unknown>,note:string)=>{
      if(!this.definitions().some(tool=>tool.function.name===name))return;
      this.workflowStarted=true;
      this.workflowNote=note;
      return {id:uid("workflow"),name,arguments:JSON.stringify(args)};
    };
    if(intent.delegation&&intent.specialist&&!intent.solo){
      if(!this.options.workspaceRoot||!this.specialistReady(intent.specialist)){
        this.workflowNote=`The requested ${intent.specialist} specialist is unavailable. Explain the missing workspace, permissions or model configuration instead of claiming delegation.`;
      }else return schedule("Agent",{description:`${intent.specialist} handoff`,prompt:brief,subagent_type:intent.specialist,read_only:intent.specialist==="Designer"||intent.specialist==="Type & QA"},"The runtime delegated the explicitly requested specialist. Use the returned evidence to finish the request.");
    }
    if(designBuild&&!intent.solo&&!intent.specialist&&ready){
      const title=(options.taskTitle??brief.trim().split(/\r?\n/,1)[0]).slice(0,160);
      if(brief.length<=6000)return schedule("DesignJob",{action:"start",title,brief,...(intent.inPlace?{worktree:false}:{})},"The runtime started the Designer → Code → QA relay. Report its actual result. If blocked or interrupted, surface the blocker and retained job instead of bypassing approval or repeating work.");
      this.workflowNote="The visual brief exceeds the DesignJob input limit. Condense it into a faithful brief with all constraints, then call DesignJob.";
    }
    if(intent.designDraft&&!intent.solo&&!intent.specialist&&this.options.workspaceRoot&&this.specialistReady("Designer")&&roleKey(this.role(this.rootOwner)?.role??"")!=="designer"){
      return schedule("Agent",{description:"Designer proposal",prompt:`Produce a design proposal using ArtifactDesign and incumbent workspace styles. Include semantic token roles, component states, breakpoints and verification criteria. User request: ${brief}`,subagent_type:"Designer",read_only:true},"The runtime started a Designer proposal. Present the actual design decisions and retain the user's scope.");
    }
    if((intent.delegation||options.inspectBuild)&&!intent.solo&&!intent.specialist&&this.options.workspaceRoot){
      const specialist:Specialist[]=intent.visual?["Designer","Type & QA","Code","Orchestrator"]:["Type & QA","Designer","Code","Orchestrator"];
      const role=specialist.find(type=>this.specialistReady(type));
      if(role||!this.options.agents)return schedule("Agent",{description:"Independent workspace inspection",prompt:`Use ListFiles, Glob or Grep to locate the relevant files, then Read the files and tests needed to ground your findings. Return concrete file paths, constraints and verification steps for the parent. User request: ${brief}`,subagent_type:role??"Explore",read_only:true},"Use the independent inspection result to plan the work and delegate further where it advances the request.");
      this.workflowNote="No enabled specialist has a configured model. Report the configuration gap when explaining why delegation did not run.";
    }
    if(intent.visual){
      return schedule("ArtifactDesign",{action:"read"},this.workflowNote??(
        designBuild&&!intent.solo&&!ready
          ?"The full design relay needs a writable workspace, no active plan and enabled Designer, Code and Type & QA models. Use the loaded project contract within the current permissions and report any unavailable stage."
          :"The runtime loaded the project design contract. Use its semantic tokens, components and responsive rules for the requested visual work."
      ));
    }
  }
  kickoffStatus(){return this.workflowNote;}
  async reserveModelRequest(requestId:string,kind:"model"|"child"="model"){
    if(this.controller.signal.aborted)throw stopped();
    if(this.remainingRequests<=0)throw Error("The parent and its agents exhausted their shared 128-request budget.");
    this.remainingRequests--;
    await this.designLedger?.reserveRequest(requestId,kind);
    if(this.controller.signal.aborted)throw stopped();
  }
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
  private roleContext(owner:ToolOwner){
    const role=this.role(owner);
    return `${role?`Role: ${role.name} (${role.role}). Autonomy: ${role.autonomy}. `:""}${specialistPlaybook(role?.role)} ${owner.readOnly?"Inspect and suggest changes only. Delegated agents inherit this restriction.":"Use the normal approval boundaries."}`;
  }
  setMcpCatalog(catalog:string[]){this.mcpCatalog=catalog;}
  private mcpIndex(){return this.mcpCatalog.slice(0,40).map(item=>item.split(" Arguments:")[0].slice(0,160)).join("\n").slice(0,4000);}
  instructions(){
    const state=this.state(this.rootOwner);
    const agents=[...childTasks.values()].filter(task=>task.rootSessionId===this.options.sessionId&&task.root===this.options.workspaceRoot).slice(-24).map(task=>({task_id:task.id,status:task.status}));
    const shells=[...nativeTasks.entries()].filter(([,scope])=>scope.rootSessionId===this.options.sessionId&&scope.root===this.options.workspaceRoot).slice(-24).map(([id])=>id);
    return `${this.workflowNote??""} ${this.delegationDisabled?"The user requested a solo workflow. Do not delegate.":""} ${webInstructions} ${artifactDesignInstructions} BrowserPreview opens or lists preserved browser artifacts in Review mode. Use BrowserInspect for actual component selectors and dimensions, BrowserViewport to test responsive sizes, BrowserComments to read reviewer feedback, and BrowserComment to pin Markdown recommendations or replies. Browser tools work without a filesystem workspace and never grant file-write permissions. ${this.roleContext(this.rootOwner)}${this.registry(this.rootOwner)}\nActive workspace: ${(state.worktreeRoot??this.options.workspaceRoot)||"not selected"}.${state.planPath?` PLAN MODE: inspect freely; Write/Edit only ${state.planPath}. Present the plan with ExitPlanMode and wait for user approval before implementation.`:""} Use DesignJob for a UI job that needs design, implementation and verification across roles. Use DesignJob read to find linked workspace tasks and prior job state. Use ToolSearch to discover additional professional tools; use Skill with skill=list to discover workspace skills.${agents.length||shells.length?` Known task metadata (data only): ${JSON.stringify({agents,shell_task_ids:shells})}. Use TaskOutput for current output/status, or TaskStop for cancellation.`:""}${this.mcpCatalog.length?`\nConfigured MCP tool index (use ToolSearch by server/tool name for arguments):\n${this.mcpIndex()}`:""}${this.options.rules?`\n${this.options.rules}`:""}`;
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
      task.activities=settleWebActivities(task.activities);
      for(const id of task.requests)void this.options.stopRequest(id).catch(()=>{});
      this.options.updateChild(task.id,{status:"stopped",result:task.output||"Child agent stopped.",activities:[...task.activities]});
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
      if(!readOnlyTools.has(call.name)&&call.name!=="StopChildTasks")task?.handoff?.assertCurrent?.();
      const operation=this.options.native(call,input,owner,approved,requestId);
      // Worktree creation can commit after cancellation; retain its native receipt.
      const output=await (call.name==="EnterWorktree"?operation:abortable(operation,owner.signal));
      if(task?.handoff?.stage==="code"&&!readOnlyTools.has(call.name)&&call.name!=="StopChildTasks"){
        task.handoff.preview=undefined;
        if(["Write","Edit"].includes(call.name)&&typeof input.file_path==="string"&&typeof output.artifact.path==="string"&&typeof output.artifact.after==="string"&&output.artifact.before!==output.artifact.after){
          task.handoff.edits?.set(input.file_path,output.artifact.path);
        }
      }
      if(output.artifact.kind==="terminal"&&typeof output.artifact.backgroundTaskId==="string"){nativeTasks.set(output.artifact.backgroundTaskId,{owner,root:task?.root??owner.workspaceRoot,rootSessionId:task?.rootSessionId??owner.sessionId});this.launchedShells.add(output.artifact.backgroundTaskId);}
      return output;
    }finally{task?.requests.delete(requestId);owner.signal.removeEventListener("abort",cancel);}
  }
  private async executeFor(call:ToolCall,input:Record<string,unknown>,owner:ToolOwner,requestId=uid("tool")):Promise<ToolOutput>{
    if(owner.signal.aborted)throw stopped();
    const state=this.state(owner);
    if(this.role(owner)?.enabled===false)throw Error("This agent is disabled");
    if(this.delegationDisabled&&(call.name==="Agent"||call.name==="DesignJob"&&input.action!=="read"))throw Error("The user asked to work without delegation.");
    if(call.name==="DesignJob")return this.designJob(input,owner);
    const child=owner.childId?childTasks.get(owner.childId):undefined;
    if(call.name==="SubmitDesignHandoff"){
      const handoff=child?.handoff;
      if(!handoff)throw Error("Only an assigned design stage can submit a handoff.");
      const submission=parseDesignSubmission(handoff.stage,input.artifact);
      if(handoff.stage==="code"){
        const code=submission as CodeHandoff;
        if(code.previewId!==handoff.preview?.previewId||code.revisionId!==handoff.preview?.revisionId)throw Error("Submit the preview revision rendered by this implementation stage.");
        if(!code.files.length||code.files.some(file=>!handoff.edits?.has(file)))throw Error("List the files actually changed with Write or Edit during this stage, using their original file_path values.");
        code.files=code.files.map(file=>handoff.edits!.get(file)!);
      }
      if(handoff.stage==="qa"&&(!handoff.inspected||!handoff.sawAudit))throw Error("Inspect the assigned revision and retrieve an audit screenshot before submitting QA.");
      handoff.submission=submission;
      return result("Handoff validated.",{kind:"design-handoff"});
    }
    if(call.name==="Skill"&&String(input.skill??"list").trim()!=="list"&&this.skillDisabled(String(input.skill)))throw Error("This skill is disabled");
    if(!state.catalog.allowed(call.name))throw Error(`${call.name} is unavailable${owner.readOnly?" to this read-only agent":""}.`);
    if(artifactToolNames.has(call.name))return executeArtifactTool(input,{workspace:this.options.workspaceRoot,readOnly:owner.readOnly,planning:!!state.planPath||!!owner.ancestors?.some(ancestor=>sessions.get(stateKey(ancestor))?.planPath),signal:owner.signal,designIntent:child?.handoff?.design},this.options.artifactServices);
    if(reviewToolNames.has(call.name)){
      const expected=child?.handoff?.expectedPreview;
      if(expected&&call.name==="BrowserPreview")throw Error("QA must inspect the assigned saved revision.");
      const scope=owner.reviewScope??{workspace:this.options.workspaceRoot,sessionId:this.options.sessionId};
      if(expected&&call.name==="BrowserAudit"&&input.run!==false)throw Error("Read the assigned audit using run=false.");
      let reviewInput=expected?{...input,preview_id:expected.previewId,expected_revision_id:expected.revisionId,expected_audit_id:child?.handoff?.auditId}:input;
      const implementsPreview=child?.handoff?.stage==="code"&&call.name==="BrowserPreview"&&(input.url||input.html!==undefined||input.file_path!==undefined);
      if(call.name==="BrowserPreview"&&input.file_path!==undefined&&!implementsPreview)throw Error("file_path is available for the Code stage of a design job.");
      if(implementsPreview){
        if(!child?.handoff?.edits?.size)throw Error("Implement the approved plan with Write or Edit before rendering its preview.");
        if(input.file_path!==undefined){
          if(typeof input.file_path!=="string"||!child.handoff.edits.has(input.file_path)||input.url||input.html!==undefined)throw Error("Supply one edited HTML file_path, or a loopback development URL.");
          const read=await this.native({name:"Read",id:uid("preview-source"),arguments:"{}"},{file_path:input.file_path,raw:true},owner,false);
          if(typeof read.artifact.content!=="string")throw Error("The edited HTML source could not be read.");
          reviewInput={...input,html:read.artifact.content};
        }else{
          if(typeof input.url!=="string")throw Error("Use the edited HTML file_path or the app's loopback development URL.");
          const url=new URL(input.url);
          if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname))throw Error("Implementation previews must point to the local development server.");
        }
      }
      const output=await executeReviewTool(call.name,reviewInput,{scope,author:this.role(owner)?.name??this.options.agentId,role:this.role(owner)?.role??'Agent',signal:owner.signal},this.options.reviewServices);
      if(child?.handoff?.stage==="qa"&&output.artifact.kind==="image"){
        if(call.name==="BrowserInspect")child.handoff.inspected=true;
        if(call.name==="BrowserAudit"&&input.run===false&&input.case_index!==undefined)child.handoff.sawAudit=true;
      }
      if(child?.handoff?.stage==="code"&&implementsPreview&&typeof output.artifact.previewId==="string"&&typeof output.artifact.revisionId==="string"){
        child.handoff.preview={previewId:output.artifact.previewId,revisionId:output.artifact.revisionId};
        child.handoff.submission=undefined;
      }
      return output;
    }
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
    if((call.name==="TaskOutput"||call.name==="TaskStop"||call.name==="TaskTakeover")&&String(input.task_id??input.shell_id??"").startsWith("agent-"))return this.agentTask(call.name,input,owner);
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
  private async designJob(input:Record<string,unknown>,owner:ToolOwner):Promise<ToolOutput>{
    if(owner.depth)throw Error("Only the parent can orchestrate a design job.");
    if(!this.options.workspaceRoot)throw Error("Select a workspace for the design job.");
    const repository=this.options.tasks??taskRepository;
    const workspace=workspaceRuleKey(this.options.workspaceRoot,"taro");
    const action=input.action;
    if(!["start","read","resume"].includes(String(action)))throw Error("Choose start, read or resume.");
    if(action==="start"&&input.job_id!==undefined)throw Error("Use resume to continue an existing job.");
    await repository.load(workspace);
    const snapshot=repository.snapshot(workspace);
    if(!snapshot.loaded)throw Error(snapshot.error??"Workspace tasks are unavailable.");
    const existing=snapshot.tasks.find(task=>task.id===input.job_id);
    if(action==="read"){
      const entries=input.job_id?snapshot.tasks.filter(task=>task.id===input.job_id):snapshot.tasks.slice(0,30);
      if(input.job_id&&!entries.length)throw Error("Task not found in this workspace.");
      const value=entries.map(task=>({
        id:task.id,title:task.title,status:task.status,
        job:input.job_id?task.designJob:task.designJob&&{phase:task.designJob.phase,version:task.designJob.version},
        reviewItem:task.reviewItem,
      }));
      return result(JSON.stringify(value),{kind:"design-job",jobs:value});
    }
    if(owner.readOnly)throw Error("Use a writable parent agent to run a design job.");
    for(const [label,key] of [["Designer","designer"],["Code","code"],["Type & QA","typeqa"]]){
      const agent=this.options.agents?.find(item=>[item.id,item.name,item.role].some(value=>value.toLowerCase().replace(/ agent$/,"").replace(/[^a-z]/g,"")===key));
      if(!agent?.enabled||!this.options.models.some(model=>model.id===agent.model||model.label===agent.model)){
        throw Error(`Enable ${label} and assign it a configured model before running the design job.`);
      }
      if(key==="code"&&(!agent.canWriteCode||agent.autonomy==="suggest"))throw Error("The Code role needs permission to implement the approved plan.");
    }
    if(input.worktree!==undefined&&typeof input.worktree!=="boolean")throw Error("worktree must be a boolean.");
    if(action==="resume"&&(!existing?.designJob||existing.designJob.phase==="verified"))throw Error("Only unfinished workspace design jobs can resume.");
    if(action==="start"&&(typeof input.title!=="string"||!input.title.trim()||input.title.length>180||typeof input.brief!=="string"||!input.brief.trim()||input.brief.length>6000))throw Error("Supply a title and a brief up to 6,000 characters.");
    const state=this.state(owner);
    if(state.planPath&&state.planPath!==existing?.designJob?.planPath)throw Error("Finish the active plan before running a design job.");
    const task=existing??createTask(String(input.title));
    const scope=existing?.designJob?.scope??owner.reviewScope??{workspace:this.options.workspaceRoot,sessionId:this.options.sessionId};
    if(workspaceRuleKey(scope.workspace,"taro")!==workspace)throw Error("The linked review belongs to another workspace.");
    let job:DesignJob=existing?.designJob??{version:0,scope,brief:String(input.brief),phase:"design",isolate:input.worktree!==false};
    if(activeDesignJobs.has(workspace))throw Error("This workspace already has an active design job.");
    activeDesignJobs.set(workspace,{id:task.id,stop:()=>this.stopAll()});
    const parent={...owner,reviewScope:scope};
    const call=(name:string,args:Record<string,unknown>)=>{
      const tool={name,id:uid("design"),arguments:JSON.stringify(args)};
      const execute=()=>this.executeFor(tool,args,parent);
      return this.options.observeWorkflowTool?.(tool,args,execute)??execute();
    };
    const services=this.options.reviewServices??defaultReviewServices;
    const designs=this.options.artifactServices?.repository??services.designRepository;
    let createdWorktree=false;
    const persist=async(patch:Partial<DesignJob>,error?:string)=>{
      const next={...job,...patch,version:job.version+1};
      await repository.mutate(workspace,task.id,current=>{
        if(current.designJob?.version!==job.version)throw Error("Design job changed. Read its latest version before resuming.");
        if(next.phase!=="interrupted"&&owner.signal.aborted)throw stopped();
        if(next.phase==="verified"&&next.code){
          const revision=assertRevision(next.code);
          if(!revision.audits?.some(report=>report.id===next.auditId&&report.status==="measured-clear"))throw Error("The assigned audit evidence is no longer available.");
          assertLayout();
        }
        const updated={...current,designJob:next,status:(error?"Failed":"In Progress") as typeof current.status,error,details:`Design job · ${next.phase}`};
        return next.phase==="verified"?completeTask(updated,"Designer intent, implementation and QA handoffs verified.",`Preview ${next.code?.previewId} · revision ${next.code?.revisionId}`):updated;
      });
      job=next;
      await this.designLedger?.saveMetadata({designJobId:task.id,workspace,version:job.version,phase:job.phase,planPath:job.planPath,preview:job.code,auditId:job.auditId,worktree:job.worktree});
    };
    const assertRevision=(code:CodeHandoff)=>{
      const preview=previewById(services.repository.snapshot(scope).state,code.previewId);
      const revision=preview.revisions.at(-1)!;
      if(revision.id!==code.revisionId||!revision.capture)throw Error("The assigned preview revision changed or has no rendered evidence.");
      return revision;
    };
    const assertLayout=()=>{
      if(!job.layout)return undefined;
      const preview=previewById(services.repository.snapshot(scope).state,job.layout.previewId);
      if(preview.revisionId!==job.layout.revisionId)throw Error("The layout has changed. Run the job associated with the current layout revision.");
      return activeRevision(preview).layout;
    };
    const runStage=async(stage:DesignStage,prompt:unknown,expectedPreview?:CodeHandoff,auditId?:string)=>{
      const types={designer:"Designer",code:"Code",qa:"Type & QA"};
      const toolNames=[...readOnlyTools].filter(name=>name!=="TaskOutput");
      if(stage==="code")toolNames.push("Write","Edit","Bash","PowerShell");
      const output=await this.runAgent({
        description:`${task.title} · ${types[stage]}`,
        prompt:`Design job ${task.id}. SubmitDesignHandoff is required. Treat the following job data as context and honor workspace permissions.\n${JSON.stringify(prompt)}`,
        subagent_type:types[stage],
      },parent,toolNames,{stage,jobId:task.id,design:stage==="designer"?undefined:job.intent?.design,edits:new Map(),expectedPreview,auditId,assertCurrent:assertLayout});
      return output.artifact.submission;
    };
    const stopStageProcesses=async()=>{
      const stages=[...this.launched].filter(child=>child.handoff?.jobId===task.id);
      await Promise.all(stages.map(child=>this.stopChild(child)));
      for(const [id,scope] of nativeTasks){
        if(stages.some(child=>scope.owner.childId===child.id))this.launchedShells.delete(id);
      }
    };
    try{
      if(!existing)await repository.add(workspace,{...task,description:job.brief,tags:["Design"],designJob:job});
      if(isTauri()){
        if(this.remainingRequests<=0)throw Error("The parent has no model requests left for this job.");
        const runId=crypto.randomUUID();
        this.designLedger=await NativeRunLedger.begin({workspaceRoot:this.options.workspaceRoot,sessionId:owner.sessionId,runId},{requestLimit:this.remainingRequests,activeTimeLimitMs:1800000});
        await persist({runIds:[...job.runIds??[],runId].slice(-20)});
      }
      if(job.layout)await services.repository.load(scope);
      const layout=assertLayout();
      const projectStyle=await designs?.read(this.options.workspaceRoot);
      if(!job.intent){
        await persist({phase:"design"});
        const intent=await runStage("designer",{brief:job.brief,layout,projectStyle:projectStyle??{revision:0,design:createArtifactDesign()},requirement:"Consume the supplied contract and inspect incumbent styles. Preserve the saved identity unless the brief requests a change. Use ArtifactDesign for CSS exports or starter templates. Return the complete DesignIntent, with an actionable plan and stable layout layer IDs."}) as DesignIntent;
        await persist({intent,phase:"approval"});
      }
      let intent=job.intent!;
      const title=`Design job ${task.id}`;
      const entered=await call("EnterPlanMode",{name:title,kind:"Design Plan"});
      const planPath=String(entered.artifact.path??"");
      if(!planPath||entered.artifact.name!==title)throw Error("A different native plan is active. Finish it before resuming the design job.");
      let markdown=[`# ${task.title}`,job.brief,"## Implementation",...intent.plan.map((line,i)=>`${i+1}. ${line}`),"## Accessibility",...intent.accessibility.map(line=>`- ${line}`),"## Motion",...intent.motion.map(line=>`- ${line}`),"## DesignIntent","~~~json",JSON.stringify(intent,null,2),"~~~"].join("\n\n");
      const alreadyWritten=job.planWritten===true&&job.planPath===planPath;
      if(job.planWritten&&job.planPath&&!alreadyWritten){
        const prior=await call("Read",{file_path:job.planPath,raw:true});
        if(typeof prior.artifact.content!=="string"||!prior.artifact.content.trim())throw Error("The saved plan could not be recovered. Review the prior plan before resuming.");
        markdown=prior.artifact.content;
      }
      await persist({phase:"approval",planPath,planWritten:alreadyWritten});
      if(!alreadyWritten){
        await call("Write",{file_path:planPath,content:markdown});
        await persist({planWritten:true});
      }
      let approvedPlan:ToolOutput;
      try{approvedPlan=await call("ExitPlanMode",{});}
      catch(error){
        if(!String(error).includes("preview of the current file"))throw error;
        approvedPlan=await call("ExitPlanMode",{});
      }
      intent=approvedDesignIntent(approvedPlan.artifact.markdown);
      assertLayout();
      if(job.worktree&&state.worktreeRoot&&state.worktreeRoot!==job.worktree)throw Error("Exit the current worktree before resuming this job.");
      if((job.worktree||(input.worktree??job.isolate)===true)&&!state.worktreeRoot){
        await call("EnterWorktree",job.worktree?{resume_path:job.worktree}:{name:`design-${task.id}`});
        createdWorktree=true;
      }
      await persist({phase:"code",intent,worktree:state.worktreeRoot??job.worktree});
      let feedback:unknown=job.verdict;
      for(let attempt=0;attempt<2;attempt++){
        const code=await runStage("code",{intent,planPath,approvedPlan:approvedPlan.artifact.markdown,brief:job.brief,priorPreview:job.code,feedback,previousWorktree:job.worktree,requirement:"Implement the approved plan with Write or Edit. Open the actual result with BrowserPreview file_path for edited standalone HTML or url for a local development server. Submit its returned IDs, changed files using their original file_path values, and checklist."}) as CodeHandoff;
        await services.repository.load(scope);
        assertRevision(code);
        const previousPreviews=job.code?[...job.previousPreviews??[],job.code].slice(-12):job.previousPreviews;
        await persist({phase:"qa",code,previousPreviews,auditId:undefined,verdict:undefined});
        const review=async(name:string,args:Record<string,unknown>)=>{
          const input={...args,preview_id:code.previewId,expected_revision_id:code.revisionId};
          const tool={name,id:uid("design-review"),arguments:JSON.stringify(input)};
          const execute=async()=>{
            const output=await executeReviewTool(name,input,{scope,author:"Taro",role:"QA",signal:owner.signal},services);
            assertRevision(code);
            return output;
          };
          const output=await (this.options.observeWorkflowTool?.(tool,input,execute)??execute());
          return JSON.parse(output.text);
        };
        const widths=[{width:393,height:852},{width:768,height:1024},{width:1440,height:900}];
        const viewports=[];
        for(const size of widths){
          const evidence=await review("BrowserViewport",size);
          viewports.push({viewport:evidence.viewport,document:evidence.document});
        }
        const inspected=await review("BrowserInspect",{});
        const audit=await review("BrowserAudit",{});
        await persist({auditId:audit.id});
        const verdict=await runStage("qa",{intent,code,viewports,audit:{id:audit.id,status:audit.status,cases:audit.cases.map((item:{mode:string;scheme:string;findings:unknown[];unmeasured:unknown[]})=>({mode:item.mode,scheme:item.scheme,findings:item.findings.slice(0,12),unmeasured:item.unmeasured.slice(0,8)}))},components:inspected.components?.slice(0,12),requirement:"Inspect the assigned preview and stored audit screenshots with BrowserAudit run=false. Pin actionable feedback with BrowserComment. Submit pass or fail with evidence."},code,audit.id) as DesignVerdict;
        const overflow=viewports.some(item=>item.document.width>item.viewport.width+1);
        const passed=verdict.passed&&!overflow&&audit.status==="measured-clear";
        const verified={passed,findings:[...verdict.findings,...(overflow?["Horizontal overflow in the viewport sweep."]:[]),...(audit.status!=="measured-clear"?[`Browser audit returned ${audit.status}.`]:[])]};
        if(passed)await stopStageProcesses();
        if(passed&&designs&&!projectStyle){
          assertRevision(code);assertLayout();
          if(owner.signal.aborted)throw stopped();
          const savedStyle=await designs.read(this.options.workspaceRoot);
          if(owner.signal.aborted)throw stopped();
          if(!savedStyle)await designs.save(this.options.workspaceRoot,intent.design,0);
        }
        await persist({verdict:verified,phase:passed?"verified":"code"});
        if(passed)return result(JSON.stringify({jobId:task.id,...job}),{kind:"design-job",jobId:task.id,phase:job.phase,previewId:code.previewId,revisionId:code.revisionId});
        feedback={verdict:verified,auditId:audit.id,viewports,threads:await review("BrowserComments",{})};
      }
      throw Error("QA found remaining issues after the revision pass. Resume the job after reviewing its findings.");
    }catch(error){
      try{await stopStageProcesses();}
      catch(cleanupError){error=Error(`${String(error)}. Stage cleanup needs attention: ${String(cleanupError)}`);}
      await persist({phase:"interrupted",worktree:state.worktreeRoot??job.worktree},String(error)).catch(persistenceError=>{
        throw Error(`${String(error)}. Job state could not be saved: ${String(persistenceError)}`);
      });
      throw error;
    }finally{
      if(createdWorktree){
        try{
          if(owner.signal.aborted){
            await this.stopAll();
            await this.native({id:uid("release-worktree"),name:"ExitWorktree",arguments:'{"action":"keep"}'},{action:"keep"},{...owner,signal:new AbortController().signal},false);
            state.worktreeRoot=undefined;
          }else await call("ExitWorktree",{action:"keep"});
        }
        catch(error){this.options.emit({id:uid("worktree"),role:"event",text:`Worktree remains active: ${String(error)}`});}
      }
      const ledger=this.designLedger;
      this.designLedger=undefined;
      if(ledger){
        try{await ledger.finish(job.phase==="verified"?"completed":owner.signal.aborted?"cancelled":"failed");}
        catch(error){this.options.emit({id:uid("design-ledger"),role:"event",text:`Design run ledger needs attention: ${String(error)}`});}
      }
      activeDesignJobs.delete(workspace);
    }
  }
  private async runAgent(input:Record<string,unknown>,parent:ToolOwner,allowedTools?:string[],handoff?:ChildTask['handoff']):Promise<ToolOutput>{
    if(this.delegationDisabled)throw Error("The user asked to work without delegation.");
    if(parent.depth>=2)throw Error("Child-agent nesting limit reached");
    const prompt=String(input.prompt??"").trim(),description=String(input.description??"").trim();
    if(!prompt||!description)throw Error("Agent requires description and prompt");
    if(input.isolation!==undefined&&input.isolation!=="worktree")throw Error("Agent isolation must be worktree");
    if(input.run_in_background!==undefined&&typeof input.run_in_background!=="boolean")throw Error("run_in_background must be a boolean");
    if(input.read_only!==undefined&&typeof input.read_only!=="boolean")throw Error("read_only must be a boolean");
    const type=String(input.subagent_type??"general-purpose");
    const requestedRole={"general-purpose":"code",Explore:"typeqa",Plan:"designer"}[type];
    const role=this.specialist(type)??(requestedRole?this.options.agents?.find(agent=>roleKey(agent.role)===requestedRole):undefined);
    if(this.options.agents&&!role)throw Error("Requested agent role is not configured");
    if(!["Explore","Plan","general-purpose"].includes(type)&&!role)throw Error("Unknown or unconfigured subagent_type");
    if(role&&!role.enabled)throw Error("Requested agent is disabled");
    if(role&&input.model&&input.model!==role.model)throw Error("Configured role model cannot be overridden");
    const parentRole=this.role(parent);
    if(this.delegationApprovalRequired||parentRole?.autonomy==="ask"||role?.autonomy==="ask"){
      const approved=await abortable(this.options.approve({id:uid("agent-approval"),name:"Agent",arguments:JSON.stringify(input)},input,{owner:parent,force:true}),parent.signal);
      if(!approved)throw Error("User denied delegation");
    }
    const inheritedReadOnly=parent.readOnly||input.read_only===true||!!handoff&&handoff.stage!=="code"||!!role&&(!role.canWriteCode||role.autonomy==="suggest");
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
    const owner:ToolOwner={sessionId:`${parent.sessionId}:${id}`,workspaceRoot:String(access.artifact.workspaceRoot??state.worktreeRoot??parent.workspaceRoot),roleId:role?.id,readOnly:inheritedReadOnly||planning||type==="Explore"||type==="Plan",depth:parent.depth+1,childId:id,groupId:parent.groupId,signal:controller.signal,reviewScope:parent.reviewScope,ancestors:[...parent.ancestors??[],{workspaceRoot:parent.workspaceRoot,sessionId:parent.sessionId}]};
    const task:ChildTask={id,root:parentTask?.root??parent.workspaceRoot,rootSessionId,parentSessionId:parent.sessionId,owner,controller,description,prompt,status:"running",output:"",requests:new Set(),done:Promise.resolve(),activities:[],model:model.label,handoff};
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
    return result(task.output,{kind:"agent",task_id:id,agentId:id,status:task.status,result:task.output,submission:handoff?.submission});
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
    const stage=task.handoff?.stage;
    const stageRules=stage==="designer"
      ?"Inspect incumbent files, then submit the validated DesignIntent with SubmitDesignHandoff."
      :stage==="code"
        ?"ArtifactDesign read, export and template use the approved job contract. Apply it with Write or Edit, render the actual result and submit the implementation handoff."
        :stage==="qa"
          ?"Use BrowserInspect and BrowserAudit with run=false and case_index to inspect the assigned revision and audit. Submit the evidence-based verdict with SubmitDesignHandoff."
          :"Return concrete findings or actual changes, paths, and verification to the parent.";
    const messages:unknown[]=[{role:"system",content:`You are a Taro child agent. ${webInstructions} ${artifactDesignInstructions} ${this.roleContext(owner)} ${stageRules}${this.registry(owner)} Complete only the assigned task. Workspace: ${this.state(owner).worktreeRoot??owner.workspaceRoot}. Use ToolSearch for additional tools and Skill with skill=list for workspace skills.${this.options.rules?`\n${this.options.rules}`:""}${this.mcpCatalog.length?`\nConfigured MCP tool index (use ToolSearch for arguments):\n${this.mcpIndex()}`:""}`},{role:"user",content:task.prompt}];
    if(!stage&&workflowIntent(task.prompt).visual){
      try{
        const contract=await executeArtifactTool({action:"read"},{workspace:this.options.workspaceRoot,readOnly:true,planning:false,signal:owner.signal},this.options.artifactServices);
        const id=uid("design-reference");
        messages.push(
          {role:"assistant",content:null,tool_calls:[{id,type:"function",function:{name:"ArtifactDesign",arguments:'{"action":"read"}'}}]},
          {role:"tool",tool_call_id:id,content:contract.text},
        );
      }catch(error){
        if(owner.signal.aborted)throw stopped();
        messages.push({role:"system",content:`Project design reference could not be loaded: ${String(error)}. Use ArtifactDesign to retry and report unavailable project memory.`});
      }
    }
    let requestedHandoff=false;
    for(let round=0;round<32;round++){
      if(owner.signal.aborted)throw stopped();
      const requestId=uid("child-request");
      await this.reserveModelRequest(requestId,"child");
      if(owner.signal.aborted)throw stopped();
      task.requests.add(requestId);let received="",lastPublished=-Infinity;
      const previousOutput=task.output;
      const publish=()=>{task.output=previousOutput+(previousOutput&&received?"\n\n":"")+received;this.options.updateChild(task.id,{result:task.output});};
      let calls:ToolCall[];
      const tools=this.state(owner).catalog.definitions();
      if(task.handoff)tools.push(designSubmissionDefinition(task.handoff.stage));
      try{calls=await abortable(this.options.stream({requestId,endpoint:model.endpoint,model:model.model||model.label,credentialId:model.id,messages:boundedModelContext(messages),tools},delta=>{if(!task.handoff&&!owner.signal.aborted){received+=delta;task.output=previousOutput+(previousOutput&&received?"\n\n":"")+received;if(Date.now()-lastPublished>=120){lastPublished=Date.now();publish();}}}),owner.signal);}finally{task.requests.delete(requestId);if(received)publish();}
      if(!calls.length&&!task.handoff){if(!received.trim())throw Error("The child agent returned an empty response without a result.");task.status="completed";this.options.updateChild(task.id,{status:"completed",result:task.output});return;}
      if(!calls.length&&task.handoff){
        if(requestedHandoff)throw Error("Design stage ended without its required structured handoff.");
        requestedHandoff=true;
        messages.push({role:"system",content:`The ${task.handoff.stage} stage is still open. Use the required evidence tools and SubmitDesignHandoff with the requested artifact schema.`});
        continue;
      }
      messages.push({role:"assistant",content:received||null,tool_calls:calls.map(call=>({id:call.id,type:"function",function:{name:call.name,arguments:call.arguments}}))});
      for(const call of calls){
        if(owner.signal.aborted)throw stopped();
        let input:Record<string,unknown>={};let output:ToolOutput|undefined,error:unknown;const started=Date.now();
        try{const parsed=JSON.parse(call.arguments||"{}");if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")throw Error("Tool arguments must be an object");input=parsed;}catch(caught){error=caught;}
        const web=webActivity(call.name,input);
        task.activities.push({id:call.id,kind:toolKind(call.name),...web,label:web?webLabel(web.web,'running'):toolLabel(call.name,input),status:"running"});
        this.options.updateChild(task.id,{activities:[...task.activities]});
        if(!error)try{output=await this.executeFor(call,input,owner);}catch(caught){error=caught;}
        if(owner.signal.aborted)throw stopped();
        const activity=activityFromTool(call,input,output,error,Date.now()-started);
        task.activities=task.activities.map(item=>item.id===call.id?activity:item);
        task.activities=markWebReads(task.activities,readUrls(task.activities));
        this.options.updateChild(task.id,{activities:[...task.activities]});
        messages.push({role:"tool",tool_call_id:call.id,content:error?String(error):toolResultText(call.name,output?.text??"Completed")});
        if(!error&&output?.artifact.kind==="image"&&output.artifact.dataUrl)messages.push({role:"user",content:[{type:"text",text:`Image read from ${String(output.artifact.path)}`},{type:"image_url",image_url:{url:output.artifact.dataUrl}}]});
        if(!error&&call.name==="SubmitDesignHandoff"&&task.handoff?.submission){
          task.output=JSON.stringify(task.handoff.submission);
          task.status="completed";
          this.options.updateChild(task.id,{status:"completed",result:task.output});
          return;
        }
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
    if(name==="TaskTakeover"){
      await this.stopChild(task);
      await task.done;
      const worktree=this.state(task.owner).worktreeRoot;
      if(worktree){
        await this.native({id:uid("takeover"),name:"ExitWorktree",arguments:'{"action":"keep"}'},{action:"keep"},{...task.owner,signal:new AbortController().signal},false);
        this.state(task.owner).worktreeRoot=undefined;
      }
      const family=[...this.launched].filter(child=>child===task||child.owner.ancestors?.some(ancestor=>ancestor.sessionId===task.owner.sessionId));
      for(const child of family)this.launched.delete(child);
      for(const [id,scope] of nativeTasks){
        if(scope.owner.childId===task.id||scope.owner.ancestors?.some(ancestor=>ancestor.sessionId===task.owner.sessionId))this.launchedShells.delete(id);
      }
      const handoff={taskId:id,description:task.description,worktree,workspace:task.owner.workspaceRoot,output:task.output,submission:task.handoff?.submission,status:task.status};
      return result(JSON.stringify(handoff),{kind:"agent-takeover",...handoff});
    }
    const timeout=input.timeout===undefined?30000:Number(input.timeout);
    if(!Number.isInteger(timeout)||timeout<0||timeout>600000)throw Error("timeout must be between 0 and 600000 ms");
    if(input.block!==false&&task.status==="running"&&timeout>0){let timer:ReturnType<typeof setTimeout>|undefined;try{await abortable(Promise.race([task.done,new Promise<void>(resolve=>{timer=setTimeout(resolve,timeout);})]),owner.signal);}finally{if(timer)clearTimeout(timer);}}
    const retrieval=task.status==="running"?(input.block===false?"not_ready":"timeout"):"success";
    const value={task_id:id,task_type:"local_agent",status:task.status,description:task.description,prompt:task.prompt,output:task.output,result:task.output,error:task.error};
    return result(JSON.stringify({retrieval_status:retrieval,task:value}),{kind:"task-output",retrieval_status:retrieval,task:value});
  }
}
