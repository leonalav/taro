import type {ChatMessage,Task} from '@/data/mock';

export interface WorkspaceTask extends Task {
  messages:ChatMessage[];
  createdAt:number;
  updatedAt:number;
  attempts:number;
  error?:string;
  whatWasDone?:string;
  finalProduct?:string;
  runId?:string;
  executions?:{id:string;name:string;arguments:string;timestamp:number;output?:import('./agent-tools').ToolOutput;error?:string}[];
}
export interface TaskSnapshot {tasks:WorkspaceTask[];unsavedTasks?:WorkspaceTask[];loaded:boolean;error?:string}
export interface TaskStorage {read:(workspace:string)=>Promise<string|null>;write:(workspace:string,value:string)=>Promise<void>}
export function createTask(title:string,id:string=crypto.randomUUID()):WorkspaceTask {
  if(!title.trim())throw Error('A task title is required.');
  const timestamp=Date.now();
  return {id,title:title.trim(),description:title.trim(),priority:'Medium',severity:'Medium',details:title.trim(),solution:['Inspect the relevant workspace files and confirm the requested result.','Implement the change and verify its behavior.'],tags:[],status:'To Do',messages:[],createdAt:timestamp,updatedAt:timestamp,attempts:0};
}
export function restoreTasks(raw:string|null):WorkspaceTask[]{
  if(raw===null)return [];
  const parsed:unknown=JSON.parse(raw);
  if(!Array.isArray(parsed))throw Error('Invalid task board data; the saved data was preserved.');
  return parsed.map<WorkspaceTask>(value=>{
    if(!value||typeof value!=='object'||typeof value.id!=='string'||typeof value.title!=='string'||typeof value.description!=='string'||typeof value.details!=='string'||!['High','Medium','Low'].includes(value.priority)||!['Critical','High','Medium','Low'].includes(value.severity)||!['To Do','In Progress','Failed','Done','Backlog'].includes(value.status)||!Array.isArray(value.messages)||!Array.isArray(value.solution)||value.solution.some((s:unknown)=>typeof s!=='string')||!Array.isArray(value.tags)||value.tags.some((s:unknown)=>typeof s!=='string'))throw Error('Invalid task record; the saved data was preserved.');
    const task=value as WorkspaceTask;
    if(!Number.isSafeInteger(task.attempts)||task.attempts<0||!Number.isFinite(task.createdAt)||!Number.isFinite(task.updatedAt))throw Error('Invalid saved task metadata; the saved data was preserved.');
    if(task.status==='Done'&&(!task.whatWasDone?.trim()||!task.finalProduct?.trim()))throw Error('A completed task is missing its descriptions; the saved data was preserved.');
    for(const message of task.messages){
      if(!message||typeof message.id!=='string'||typeof message.role!=='string')throw Error('Invalid saved task message; the saved data was preserved.');
      if(message.role==='activity-group'&&(!Array.isArray(message.activities)||message.activities.some(activity=>!activity||typeof activity.id!=='string'||typeof activity.label!=='string'||typeof activity.kind!=='string'||typeof activity.status!=='string')))throw Error('Invalid saved tool transcript; the saved data was preserved.');
      if(message.role==='subagent'&&!Array.isArray(message.activities))throw Error('Invalid saved child transcript; the saved data was preserved.');
      if(message.role==='plan'&&(typeof message.markdown!=='string'||typeof message.name!=='string'||typeof message.path!=='string'))throw Error('Invalid saved artifact; the saved data was preserved.');
      if(message.role==='user'&&!Array.isArray(message.segments))throw Error('Invalid saved task prompt; the saved data was preserved.');
      if(message.role==='agent'&&typeof message.text!=='string')throw Error('Invalid saved response; the saved data was preserved.');
    }
    const messages=task.messages.map(message=>message.role==='permission'&&message.live&&!message.decision?{...message,decision:{label:'Interrupted',allowed:false,target:'tool' as const,duration:'once' as const}}:message.role==='subagent'&&message.status==='running'?{...message,status:'stopped' as const,result:message.result||'Interrupted when the application closed.'}:message.role==='activity-group'?{...message,activities:message.activities.map(activity=>activity.status==='running'?{...activity,status:'failed' as const,errorTrace:'Interrupted when the application closed. Check the workspace before retrying.'}:activity)}:message);
    if(task.status==='In Progress')return {...task,messages,status:'Failed',error:'Execution was interrupted. Outputs and artifacts are preserved. Review the workspace before retrying.'};
    return {...task,messages,status:(task.status as string)==='Backlog'?'To Do':task.status};
  }).map((task,index,tasks)=>{if(tasks.findIndex(other=>other.id===task.id)!==index)throw Error('Duplicate saved task identity; the saved data was preserved.');return task;});
}
export function completeTask(task:WorkspaceTask,whatWasDone:string,finalProduct:string):WorkspaceTask {
  if(!whatWasDone.trim()||!finalProduct.trim())throw Error('Completion requires a description of what was done and the final product.');
  return {...task,status:'Done',whatWasDone:whatWasDone.trim(),finalProduct:finalProduct.trim(),error:undefined,updatedAt:Date.now()};
}
export function createTaskRepository(storage:TaskStorage){
  const snapshots=new Map<string,TaskSnapshot>(),queues=new Map<string,Promise<unknown>>(),loads=new Map<string,Promise<void>>(),listeners=new Set<()=>void>();
  const snapshot=(workspace:string)=>{let value=snapshots.get(workspace);if(!value){value={tasks:[],loaded:false};snapshots.set(workspace,value);}return value;};
  const publish=(workspace:string,value:TaskSnapshot)=>{snapshots.set(workspace,value);listeners.forEach(listener=>listener());};
  const load=(workspace:string):Promise<void>=>{
    const previous=loads.get(workspace);if(previous)return previous;
    const promise=(async()=>{try{const tasks=restoreTasks(await storage.read(workspace));publish(workspace,{tasks,loaded:true});}catch(error){publish(workspace,{tasks:[],loaded:false,error:`Could not read saved tasks: ${String(error)}`});loads.delete(workspace);}})();
    loads.set(workspace,promise);return promise;
  };
  const change=(workspace:string,update:(tasks:WorkspaceTask[])=>WorkspaceTask[])=>{
    const promise=(queues.get(workspace)??Promise.resolve()).catch(()=>{}).then(async()=>{
      await load(workspace);const current=snapshot(workspace);
      if(!current.loaded)throw Error(current.error||'Task board has not loaded.');
      const tasks=update(current.unsavedTasks??current.tasks);
      try{await storage.write(workspace,JSON.stringify(tasks));publish(workspace,{tasks,loaded:true});}
      catch(error){publish(workspace,{...current,unsavedTasks:tasks,error:`Tasks could not be saved: ${String(error)}. Unsaved outputs remain available in this session; retry saving before closing the app.`});throw error;}
    });
    queues.set(workspace,promise);return promise;
  };
  return {snapshot,load,retrySave:(workspace:string)=>change(workspace,tasks=>tasks),subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    add:(workspace:string,task:WorkspaceTask)=>change(workspace,tasks=>{if(tasks.some(t=>t.id===task.id))throw Error('Task ID already exists.');return [task,...tasks];}),
    mutate:(workspace:string,id:string,update:(task:WorkspaceTask)=>WorkspaceTask)=>change(workspace,tasks=>{if(!tasks.some(t=>t.id===id))throw Error('Task was not found in this workspace.');return tasks.map(task=>task.id===id?{...update(task),updatedAt:Date.now()}:task);}),
    flush:(workspace:string)=>queues.get(workspace)??Promise.resolve(),
  };
}
export type TaskRepository=ReturnType<typeof createTaskRepository>;
