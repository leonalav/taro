import type {ChatMessage,PermissionChoice} from '@/data/mock';
import type {Settings} from '@/data/settings';
import {ProfessionalToolRuntime} from './professional-runtime';
import {executeAgentTool,activityFromTool,listMcpTools,type ToolOutput} from './agent-tools';
import {streamModel,stopModel,type ToolCall} from './model-stream';
import {boundedModelContext} from './model-context';
import {compileWorkspaceRules} from './workspace-rules';
import {completeTask,createTask,type WorkspaceTask,type TaskRepository} from './task-store';
import {recordActivity,recordDesignActivity} from './activity-store';
import {recordAiCodeChange,recordAiMessage} from './usage-metrics';

const id=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
const fn=(name:string,description:string,properties:Record<string,unknown>,required:string[])=>({type:'function' as const,function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
const string={type:'string'},strings={type:'array',items:string,minItems:1};
export const taskTools=[
  fn('TaskUpdate','Describe this task before implementation. Use one-word tags and a numbered short explanation and solution.',{description:string,details:string,priority:{type:'string',enum:['Low','Medium','High']},tags:strings,solution:strings},['description','details','priority','tags','solution']),
  fn('TaskCreate','Add a separate to-do to this workspace task board.',{title:string,description:string},['title','description']),
  fn('TaskComplete','Finish this task only after verification. Describe what was actually done and the resulting final product. Do not claim unverified results.',{whatWasDone:string,finalProduct:string},['whatWasDone','finalProduct']),
];
interface Dependencies {
  stream:typeof streamModel;
  stop:typeof stopModel;
  native:typeof executeAgentTool;
  listMcp:typeof listMcpTools;
}
interface ActiveRun {workspace:string;taskId:string;cancelled:boolean;controller:AbortController;runtime?:ProfessionalToolRuntime;requests:Set<string>;approvals:Map<string,(allowed:boolean)=>void>}
async function cancellable<T>(promise:Promise<T>,run:ActiveRun):Promise<T>{
  if(run.controller.signal.aborted)throw Error('Task stopped.');
  let cancel=()=>{};
  const stopped=new Promise<never>((_,reject)=>{cancel=()=>reject(Error('Task stopped.'));run.controller.signal.addEventListener('abort',cancel,{once:true});});
  try{return await Promise.race([promise,stopped]);}finally{run.controller.signal.removeEventListener('abort',cancel);}
}
export function createTaskExecutor(repository:TaskRepository,dependencies:Dependencies={stream:streamModel,stop:stopModel,native:executeAgentTool,listMcp:listMcpTools}){
  const runs=new Map<string,ActiveRun>();
  const key=(workspace:string,task:string)=>`${workspace}\0${task}`;
  const taskAt=(workspace:string,taskId:string)=>{const snapshot=repository.snapshot(workspace);const task=(snapshot.unsavedTasks??snapshot.tasks).find(t=>t.id===taskId);if(!task)throw Error('Task not found in this workspace.');return task;};
  const append=(workspace:string,taskId:string,message:ChatMessage)=>repository.mutate(workspace,taskId,t=>({...t,messages:[...t.messages,message]}));
  const active=(workspace:string,taskId:string)=>runs.has(key(workspace,taskId));
  async function start(workspace:string,taskId:string,workspaceRoot:string,settings:Settings){
    if(!workspaceRoot)throw Error('Open a workspace folder before running tasks.');
    if([...runs.values()].some(run=>run.workspace===workspace))throw Error('Another task is running in this workspace. Stop it or wait for it to finish.');
    const role=settings.agents.find(a=>/orchestrator/i.test(a.role))??settings.agents.find(a=>a.enabled&&/code/i.test(a.role));
    if(role&&!role.enabled)throw Error('Enable the Orchestrator agent in Settings before running tasks.');
    const selected=role?.model??settings.models.defaultModel;
    const model=settings.models.customModels.find(m=>m.id===selected||m.label===selected);
    if(!model)throw Error('Configure a custom endpoint for the task agent model in Settings → Models, then select it in Settings → Agents.');
    const compiled=compileWorkspaceRules(settings.rules);if(!compiled.valid)throw Error('Correct the workspace rules in Settings before running tasks.');
    await repository.load(workspace);const initialTask=taskAt(workspace,taskId);
    if([...runs.values()].some(run=>run.workspace===workspace))throw Error('Another task is running in this workspace. Stop it or wait for it to finish.');
    const run:ActiveRun={workspace,taskId,cancelled:false,controller:new AbortController(),requests:new Set(),approvals:new Map()};runs.set(key(workspace,taskId),run);
    const agentId=role?.id??'planner',sessionId=`task:${taskId}:${id('attempt')}`;
    let completion:{whatWasDone:string;finalProduct:string}|undefined;
    const configured=settings.plugins.filter(p=>p.enabled&&p.transport&&(p.command||p.url));
    const mutate=(update:(task:WorkspaceTask)=>WorkspaceTask)=>repository.mutate(workspace,taskId,update);
    let callbackError:unknown;
    const persistCallback=(promise:Promise<unknown>)=>{void promise.catch(error=>{callbackError=error;run.cancelled=true;run.controller.abort();run.runtime?.stop();});};
    try{
      await mutate(t=>({...t,status:'In Progress',error:undefined,runId:sessionId,attempts:t.attempts+1}));
      await append(workspace,taskId,{id:id('event'),role:'event',text:`Attempt ${taskAt(workspace,taskId).attempts} started. Earlier artifacts are preserved.`});
      const runtime=run.runtime=new ProfessionalToolRuntime({sessionId,workspaceRoot,agentId,model,models:settings.models.customModels,agents:settings.agents,skills:settings.skills,plugins:configured,rules:compiled.text,
        stream:dependencies.stream,stopRequest:dependencies.stop,
        native:async(call,input,owner,approved,requestId)=>{
          const cleanup=call.name==='StopChildTasks'||call.name==='TaskStop'&&run.cancelled;
          if(cleanup)return dependencies.native(call,input,owner.workspaceRoot,approved,undefined,requestId,{sessionId:owner.sessionId,readOnly:owner.readOnly,planningAncestors:owner.ancestors});
          run.requests.add(requestId);
          try{
            await mutate(t=>({...t,executions:[...t.executions??[],{id:requestId,name:call.name,arguments:JSON.stringify(input),timestamp:Date.now()}]}));
            if(run.cancelled||owner.signal.aborted)throw Error('Stopped before dispatch. The tool was not executed.');
            const output=await dependencies.native(call,input,owner.workspaceRoot,approved,call.name==='MCP'?configured.find(p=>p.id===input.server):undefined,requestId,{sessionId:owner.sessionId,readOnly:owner.readOnly,planningAncestors:owner.ancestors});
            await mutate(t=>({...t,executions:t.executions?.map(e=>e.id===requestId?{...e,output}:e)}));
            if(typeof window!=='undefined'&&['Write','Edit','NotebookEdit','Bash','PowerShell','MCP','EnterWorktree','ExitWorktree'].includes(call.name))window.dispatchEvent(new Event('taro:workspace-changed'));
            recordAiCodeChange({eventId:requestId,workspaceId:workspace,toolName:call.name,result:output});
            if(['Write','Edit','NotebookEdit'].includes(call.name)&&output.artifact.status!=='failed'&&output.artifact.before!==output.artifact.after){recordActivity({id:requestId,workspace,kind:'code',timestamp:Date.now()});if(typeof window!=='undefined')window.dispatchEvent(new Event('taro:workspace-changed'));}
            return output;
          }finally{run.requests.delete(requestId);}
        },
        emit:message=>{persistCallback(append(workspace,taskId,message));if(message.role==='plan'&&message.kind==='Design Plan')recordDesignActivity({workspace,path:message.path,markdown:message.markdown});},
        updateChild:(childId,patch)=>persistCallback(mutate(t=>({...t,messages:t.messages.map(m=>m.role==='subagent'&&m.childId===childId?{...m,...patch}:m)}))),
        approve:async(call,input,{owner,plan})=>{
          if(run.cancelled||owner.signal.aborted)return false;
          const permissionId=id('permission');
          await append(workspace,taskId,{id:permissionId,role:'permission',agentId,mcp:call.name==='MCP'?String(input.server):'workspace tool',tool:plan?`Approve ${plan.name} (${plan.path})`:`${call.name}: ${JSON.stringify(input)}`,live:true,onceOnly:true});
          return new Promise<boolean>(resolve=>{
            const done=(allowed:boolean)=>{owner.signal.removeEventListener('abort',cancel);run.approvals.delete(permissionId);resolve(allowed);};
            const cancel=()=>{persistCallback(mutate(t=>({...t,messages:t.messages.map(m=>m.id===permissionId&&m.role==='permission'?{...m,decision:{label:'Stopped',allowed:false,target:'tool',duration:'once'}}:m)})));done(false);};
            run.approvals.set(permissionId,done);owner.signal.addEventListener('abort',cancel,{once:true});if(run.cancelled||owner.signal.aborted)cancel();
          });
        },
      });
      const catalog:string[]=[];
      for(const plugin of configured){
        if(run.cancelled)break;
        try{const listed=await cancellable(dependencies.listMcp(plugin,workspaceRoot),run);catalog.push(...listed.tools.map(tool=>`${plugin.id}/${tool.name}: ${tool.description??''} Arguments: ${JSON.stringify(tool.inputSchema??{})}`));}
        catch(error){await append(workspace,taskId,{id:id('mcp'),role:'event',text:`Could not connect ${plugin.name}: ${String(error)}`});}
      }
      runtime.setMcpCatalog(catalog);
      const current=initialTask;
      const messages:unknown[]=[{role:'system',content:`You are executing a real workspace task in Taro's Tasks section. Keep all work here. Before implementation use TaskUpdate with a Low/Medium/High priority, one-word tags, a short description, what this means, and short numbered solution steps. Inspect files, use configured skills and integrations, delegate to the enabled specialized agents when helpful, and verify results using tools. You must use TaskComplete only after verifying the work; include descriptions of what was done and the final product. Never fabricate success. If a required tool fails, recover or report failure. Workspace: ${workspaceRoot}. On a retry inspect current files and previous retained evidence before changing them. ${compiled.text}`},{role:'user',content:JSON.stringify({title:current.title,description:current.description,details:current.details,solution:current.solution,previousError:current.error,previousMessages:current.messages})}];
      for(let round=0;round<64&&!run.cancelled&&!completion;round++){
        if(callbackError)throw callbackError;
        const responseId=id('response'),requestId=id('request');let received='',lastFlush=0;
        await append(workspace,taskId,{id:responseId,role:'agent',agentId,text:''});
        const flush=()=>mutate(t=>({...t,messages:t.messages.map(m=>m.id===responseId&&m.role==='agent'?{...m,text:received}:m)}));
        run.requests.add(requestId);let calls:ToolCall[];
        try{calls=await cancellable(dependencies.stream({requestId,endpoint:model.endpoint,model:model.model||model.label,credentialId:model.id,messages:boundedModelContext([...messages,{role:'system',content:runtime.instructions()}]),tools:[...runtime.definitions(),...taskTools]},delta=>{if(run.cancelled||run.controller.signal.aborted)return;received+=delta;if(Date.now()-lastFlush>120){lastFlush=Date.now();persistCallback(flush());}}),run);}
        finally{run.requests.delete(requestId);await flush();}
        if(run.cancelled)break;
        if(received.trim()){recordAiMessage({eventId:requestId,workspaceId:workspace});recordActivity({id:requestId,workspace,kind:'message',timestamp:Date.now()});}
        if(!calls.length)throw Error(received.trim()?'The agent ended without recording completion descriptions. Review its output and retry.':'The provider returned an empty response without completion.');
        if(calls.some((call,index)=>call.name==='TaskComplete'&&index!==calls.length-1))throw Error('TaskComplete must be the final tool call. No further changes may follow completion.');
        messages.push({role:'assistant',content:received||null,tool_calls:calls.map(call=>({id:call.id,type:'function',function:{name:call.name,arguments:call.arguments}}))});
        const groupId=id('tools');await append(workspace,taskId,{id:groupId,role:'activity-group',summary:`${calls.length} tool call(s)`,activities:[],startedAt:Date.now()});
        let batchFailed=false;
        for(const call of calls){
          if(run.cancelled)break;
          let input:Record<string,unknown>={},output:ToolOutput|undefined,error:unknown;const started=Date.now();
          try{
            const parsed=JSON.parse(call.arguments||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Tool arguments must be an object.');input=parsed;
            await mutate(t=>({...t,messages:t.messages.map(m=>m.id===groupId&&m.role==='activity-group'?{...m,activities:[...m.activities,{id:call.id,kind:'plugin',label:call.name,status:'running'}]}:m)}));
            if(call.name==='TaskUpdate'){
              const tags=Array.isArray(input.tags)?input.tags.map(String):[];
              const solution=Array.isArray(input.solution)?input.solution.map(String).filter(s=>s.trim()):[];
              if(!['Low','Medium','High'].includes(String(input.priority))||!tags.length||tags.some(tag=>!tag.trim()||/\s/.test(tag))||!solution.length||!String(input.description??'').trim()||!String(input.details??'').trim())throw Error('TaskUpdate requires priority, one-word tags, description, explanation, and solution steps.');
              await mutate(t=>({...t,priority:input.priority as WorkspaceTask['priority'],tags:[...new Set(tags)],description:String(input.description),details:String(input.details),solution}));output={text:'Task description and numbered plan saved.',artifact:{kind:'task'}};
            }else if(call.name==='TaskCreate'){
              const task=createTask(String(input.title??''));task.description=String(input.description??task.title);await repository.add(workspace,task);output={text:`Created task ${task.id}.`,artifact:{kind:'task',taskId:task.id}};
            }else if(call.name==='TaskComplete'){
              if(batchFailed)throw Error('A tool failed in this batch. Resolve that failure before completing the task.');
              if(!taskAt(workspace,taskId).tags.length)throw Error('Use TaskUpdate to supply priority, one-word tags, explanation and solution before completing.');
              const done=completeTask(taskAt(workspace,taskId),String(input.whatWasDone??''),String(input.finalProduct??''));completion={whatWasDone:done.whatWasDone!,finalProduct:done.finalProduct!};output={text:'Completion descriptions recorded. Waiting for child work before final completion.',artifact:{kind:'task'}};
            }else output=await runtime.execute(call,input,groupId);
          }catch(caught){error=caught;}
          const activity={...activityFromTool(call,input,output,error,Date.now()-started),output:output?.text,detail:output?.text.slice(0,180)};
          if(error||activity.status==='failed')batchFailed=true;
          await mutate(t=>({...t,messages:t.messages.map(m=>m.id===groupId&&m.role==='activity-group'?{...m,activities:m.activities.some(a=>a.id===call.id)?m.activities.map(a=>a.id===call.id?activity:a):[...m.activities,activity]}:m)}));
          messages.push({role:'tool',tool_call_id:call.id,content:error?String(error):output?.text??'Completed'});
          if(output?.artifact.kind==='image'&&output.artifact.dataUrl)messages.push({role:'user',content:[{type:'text',text:`Image read from ${output.artifact.path}`},{type:'image_url',image_url:{url:output.artifact.dataUrl}}]});
        }
      }
      if(run.cancelled)throw Error('Stopped. Partial outputs and artifacts are preserved. Review the workspace before retrying.');
      if(callbackError)throw callbackError;
      if(!completion)throw Error('The task reached its 64-round limit without completion.');
      await runtime.settleChildren();
      await repository.flush(workspace);
      await mutate(t=>{if(run.cancelled||callbackError)throw Error('Stopped before completion. Outputs are preserved.');return completeTask(t,completion!.whatWasDone,completion!.finalProduct);});
      if(run.cancelled||callbackError)throw Error('Stopped during completion. Outputs are preserved.');
      recordActivity({id:sessionId,workspace,kind:'task',timestamp:Date.now()});
    }catch(error){
      try{await run.runtime?.stopAll();}catch(stopError){await append(workspace,taskId,{id:id('stop-error'),role:'event',text:`Cancellation needs attention: ${String(stopError)}`});}
      await mutate(t=>({...t,status:'Failed',error:String(error),messages:t.messages.map(m=>m.role==='permission'&&m.live&&!m.decision?{...m,decision:{label:'Stopped',allowed:false,target:'tool',duration:'once'}}:m)}));
    }finally{runs.delete(key(workspace,taskId));}
  }
  async function stop(workspace:string,taskId:string){const run=runs.get(key(workspace,taskId));if(!run)return;run.cancelled=true;run.controller.abort();for(const resolve of [...run.approvals.values()])resolve(false);await Promise.allSettled([...run.requests].map(request=>dependencies.stop(request)));await run.runtime?.stopAll();}
  async function decide(workspace:string,taskId:string,messageId:string,choice:PermissionChoice|null){const run=runs.get(key(workspace,taskId)),resolve=run?.approvals.get(messageId);if(!resolve)return;const decision=choice??{label:'Denied',allowed:false,target:'tool' as const,duration:'once' as const};await repository.mutate(workspace,taskId,t=>({...t,messages:t.messages.map(m=>m.id===messageId&&m.role==='permission'?{...m,decision}:m)}));resolve(decision.allowed);}
  return {start,stop,decide,active};
}
