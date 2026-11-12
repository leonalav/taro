import * as React from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {ArrowLeft,Circle,CircleCheck,CircleDot,CircleX,FileText,PanelRightClose,Play,Plus,Search,Square} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog} from '@/components/ui/dialog';
import {MessageItem} from '@/components/chat-message';
import {TASK_STATUSES,type PermissionChoice,type Priority,type TaskStatus} from '@/data/mock';
import type {Settings} from '@/data/settings';
import {taskRepository} from '@/lib/task-persistence';
import {reviewRepository} from '@/lib/review-persistence';
import {selectPreview} from '@/lib/review-store';
import type {DesignJob} from '@/lib/design-job';
import {createTask,completeTask,type WorkspaceTask} from '@/lib/task-store';
import {createTaskExecutor} from '@/lib/task-runtime';
import {executeAgentTool} from '@/lib/agent-tools';
import {artifactDocument} from '@/lib/artifact-documents';
import {cn} from '@/utils/cn';
import {recordActivity} from '@/lib/activity-store';

const executor=createTaskExecutor(taskRepository);
const priorityVariant={Low:'low',Medium:'medium',High:'high'} as const;
const icons={Failed:CircleX,'To Do':Circle,'In Progress':CircleDot,Done:CircleCheck};
const area='min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-taro';
interface TasksBoardProps {workspaceRoot?:string;workspaceId:string;settings:Settings;onClose:()=>void}
export function TasksBoard({workspaceRoot,workspaceId,settings,onClose}:TasksBoardProps){
  const snapshot=React.useSyncExternalStore(taskRepository.subscribe,()=>taskRepository.snapshot(workspaceId),()=>taskRepository.snapshot(workspaceId));
  React.useEffect(()=>{void taskRepository.load(workspaceId);},[workspaceId]);
  const [selected,setSelected]=React.useState<string|null>(null),[creating,setCreating]=React.useState(false);
  const [title,setTitle]=React.useState(''),[description,setDescription]=React.useState(''),[priority,setPriority]=React.useState<Priority>('Medium');
  const [query,setQuery]=React.useState(''),[filter,setFilter]=React.useState<TaskStatus|'all'>('all'),[error,setError]=React.useState('');
  const [priorityFilter,setPriorityFilter]=React.useState<Priority|'all'>('all');
  const [document,setDocument]=React.useState<{taskId:string;messageId:string;text:string}|null>(null),[saving,setSaving]=React.useState(false);
  const tasks=snapshot.unsavedTasks??snapshot.tasks;
  const task=tasks.find(t=>t.id===selected);
  React.useEffect(()=>{setSelected(null);setCreating(false);setDocument(null);setError('');},[workspaceId]);
  const action=(promise:Promise<unknown>)=>{setError('');void promise.catch(e=>setError(String(e)));};
  const create=async()=>{const task=createTask(title);task.description=description.trim()||title.trim();task.details=task.description;task.priority=priority;await taskRepository.add(workspaceId,task);setTitle('');setDescription('');setCreating(false);setSelected(task.id);};
  const run=(task:WorkspaceTask)=>{if(!isTauri()){setError('Task execution requires the Taro desktop app. Your task and plan are saved.');return;}action(executor.start(workspaceId,task.id,workspaceRoot??'',settings));};
  const saveTask=async(task:WorkspaceTask,update:(task:WorkspaceTask)=>WorkspaceTask)=>{
    await taskRepository.mutate(workspaceId,task.id,update);
    const saved=taskRepository.snapshot(workspaceId).tasks.find(t=>t.id===task.id);
    if(task.status!=='Done'&&saved?.status==='Done')recordActivity({id:`manual-task:${saved.id}:${saved.updatedAt}`,workspace:workspaceId,kind:'task',timestamp:Date.now()});
  };
  const openDocument=(messageId:string)=>{if(!task)return;const artifact=artifactDocument(task.messages.find(m=>m.id===messageId));if(artifact)setDocument({taskId:task.id,messageId,text:artifact.text});};
  const saveDocument=async()=>{
    if(!document)return;setSaving(true);setError('');
    try{
      const item=taskRepository.snapshot(workspaceId).tasks.find(t=>t.id===document.taskId)?.messages.find(m=>m.id===document.messageId);
      if(item?.role==='plan'&&item.path)await executeAgentTool({id:crypto.randomUUID(),name:'Write',arguments:'{}'},{file_path:item.path,content:document.text},item.workspaceRoot||workspaceRoot||'',true,undefined,crypto.randomUUID(),{sessionId:item.sessionId||`task:${document.taskId}`,readOnly:false});
      await taskRepository.mutate(workspaceId,document.taskId,t=>({...t,messages:t.messages.map(m=>m.id===document.messageId&&m.role==='plan'?{...m,markdown:document.text}:m)}));setDocument(null);
    }catch(e){setError(String(e));}finally{setSaving(false);}
  };
  const q=query.toLowerCase().trim();
  const filtered=tasks.filter(t=>(priorityFilter==='all'||t.priority===priorityFilter)&&(!q||[t.title,t.description,t.details,...t.tags].some(value=>value.toLowerCase().includes(q))));
  return <aside aria-label='Tasks' className='@container flex w-[400px] min-w-0 max-w-[calc(100%-320px)] shrink-0 flex-col bg-[#070707]'>
    <header className='flex min-h-14 shrink-0 items-center gap-2 border-b border-border px-4'>
      {task&&<Button variant='ghost' size='icon-sm' aria-label='Back to task board' onClick={()=>setSelected(null)}><ArrowLeft/></Button>}
      <h2 className='min-w-0 flex-1 truncate text-sm font-medium'>{task?task.title:'Tasks'}</h2>
      {!task&&<><span className='text-xs text-muted-foreground'>{snapshot.tasks.length}</span><Button variant='secondary' size='sm' disabled={!snapshot.loaded} onClick={()=>setCreating(v=>!v)}><Plus/>New task</Button></>}
      <Button variant='ghost' size='icon-sm' aria-label='Hide tasks' onClick={onClose}><PanelRightClose/></Button>
    </header>
    {(error||snapshot.error)&&<div role='alert' className='mx-4 mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'><p>{error||snapshot.error}</p>{snapshot.error&&<Button size='sm' variant='secondary' className='mt-2' onClick={()=>action(snapshot.loaded?taskRepository.retrySave(workspaceId):taskRepository.load(workspaceId))}>{snapshot.loaded?'Retry saving retained outputs':'Retry loading tasks'}</Button>}</div>}
    {!snapshot.loaded&&!snapshot.error&&<p role='status' className='p-5 text-sm text-muted-foreground'>Loading saved tasks…</p>}
    {task?<TaskDetail key={task.id} task={task} settings={settings} onRun={()=>run(task)} onStop={()=>action(executor.stop(workspaceId,task.id))} onSave={update=>action(saveTask(task,update))} onOpenDoc={openDocument} onDecide={(messageId,choice)=>action(executor.decide(workspaceId,task.id,messageId,choice))} onReview={()=>action(openTaskReview(task))}/>:<>
      {creating&&<form className='space-y-3 border-b border-border p-4' onSubmit={e=>{e.preventDefault();action(create());}}>
        <Input autoFocus value={title} onChange={e=>setTitle(e.target.value)} aria-label='Task title' placeholder='What needs to be done?' required/>
        <textarea className={area} aria-label='Task description' value={description} onChange={e=>setDescription(e.target.value)} placeholder='Describe the result, constraints, and how to verify it.'/>
        <div className='flex items-center gap-2'><label className='text-xs text-muted-foreground'>Priority <select className='ml-2 rounded border border-border bg-background p-1.5' aria-label='Task priority' value={priority} onChange={e=>setPriority(e.target.value as Priority)}>{(['Low','Medium','High'] as const).map(p=><option key={p}>{p}</option>)}</select></label><Button size='sm' type='submit' disabled={!title.trim()}>Create task</Button><Button variant='ghost' size='sm' type='button' onClick={()=>setCreating(false)}>Cancel</Button></div>
      </form>}
      <div className='flex flex-wrap items-center gap-2 p-4'><div className='relative min-w-0 flex-1'><Search className='absolute top-2.5 left-2.5 size-3.5 text-muted-foreground'/><Input className='pl-8' value={query} onChange={e=>setQuery(e.target.value)} aria-label='Search tasks' placeholder='Search tasks'/></div><select aria-label='Filter tasks by priority' value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value as typeof priorityFilter)} className='h-8 rounded-lg border border-border bg-background px-2 text-xs'><option value='all'>All priorities</option>{(['Low','Medium','High'] as const).map(priority=><option key={priority}>{priority}</option>)}</select><select aria-label='Filter tasks by status' value={filter} onChange={e=>setFilter(e.target.value as typeof filter)} className='h-8 rounded-lg border border-border bg-background px-2 text-xs'><option value='all'>All statuses</option>{TASK_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
      {!workspaceRoot&&<p className='px-4 pb-3 text-xs text-muted-foreground'>Open a workspace folder to run tasks. Plans and artifacts stay with their workspace.</p>}
      <div className='scrollbar-thin grid min-h-0 flex-1 auto-rows-min grid-cols-1 content-start gap-3 overflow-y-auto px-4 pb-4 @[600px]:grid-cols-2 @[1060px]:grid-cols-4'>
        {TASK_STATUSES.filter(s=>filter==='all'||filter===s).map(status=>{const Icon=icons[status],items=filtered.filter(t=>t.status===status);return <section key={status} className='min-w-0 rounded-xl border border-border bg-background p-2'><div className='flex items-center gap-2 px-2 pt-1 pb-3 text-xs text-muted-foreground'><Icon className={cn('size-3.5',status==='Failed'&&'text-destructive',status==='In Progress'&&'text-taro')}/><h3>{status}</h3><span className='ml-auto tabular-nums'>{items.length}</span></div><div className='space-y-2'>{items.map(t=><button key={t.id} type='button' onClick={()=>setSelected(t.id)} className='w-full rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-taro/50 focus-visible:outline-2 focus-visible:outline-taro'><h4 className='break-words text-[13px] leading-5 font-medium'>{t.title}</h4><p className='mt-1.5 line-clamp-3 break-words text-xs leading-5 text-muted-foreground'>{t.description}</p><div className='mt-3 flex flex-wrap gap-1.5'><Badge variant={priorityVariant[t.priority]??'medium'}>{t.priority}</Badge>{t.tags.map(tag=><Badge key={tag}>{tag}</Badge>)}</div>{t.error&&<p className='mt-2 line-clamp-2 text-xs text-destructive'>{t.error}</p>}{t.messages.length>0&&<span className='mt-2 block text-[11px] text-muted-foreground'>{t.messages.filter(m=>m.role==='plan').length} documents · {t.attempts} attempt{t.attempts===1?'':'s'}</span>}</button>)}{!items.length&&<p className='rounded-lg border border-dashed border-border px-3 py-7 text-center text-xs text-muted-foreground'>No tasks</p>}</div></section>;})}
      </div>
    </>}
    <Dialog open={!!document} onOpenChange={open=>{if(!open&&!saving)setDocument(null);}} labelledBy='task-document-title' className='flex h-[min(740px,90vh)] w-[min(900px,94vw)] flex-col'>
      <div className='flex items-center gap-2 border-b border-border p-4'><FileText className='size-4 text-taro'/><h3 id='task-document-title' className='flex-1 text-sm font-medium'>Task artifact</h3><Button variant='ghost' size='sm' disabled={saving} onClick={()=>setDocument(null)}>Close</Button><Button size='sm' disabled={saving} onClick={()=>void saveDocument()}>{saving?'Saving…':'Save document'}</Button></div>
      <textarea aria-label='Task artifact document' className='min-h-0 flex-1 resize-none bg-background p-5 font-mono text-sm leading-6 outline-none' value={document?.text??''} onChange={e=>setDocument(value=>value?{...value,text:e.target.value}:value)}/>
    </Dialog>
  </aside>;
}
async function openTaskReview(task:WorkspaceTask){
  const scope=task.reviewItem?.scope??task.designJob?.scope;
  const link=task.reviewItem??task.designJob?.code??task.designJob?.layout;
  if(!scope||!link)return;
  await reviewRepository.change(scope,state=>selectPreview(state,link.previewId,link.revisionId));
  window.dispatchEvent(new CustomEvent('taro:review-work-item',{detail:scope}));
}

function DesignComparison({job}:{job:DesignJob}){
  const before=job.previousPreviews?.at(-1),after=job.code;
  const [captures,setCaptures]=React.useState<{before?:string;after?:string;error?:string}>({});
  React.useEffect(()=>{
    let active=true;
    void reviewRepository.load(job.scope).then(()=>{
      if(!active)return;
      const snapshot=reviewRepository.snapshot(job.scope);
      if(snapshot.error){setCaptures({error:snapshot.error});return;}
      const capture=(link:typeof before)=>snapshot.state.previews.find(preview=>preview.id===link?.previewId)?.revisions.find(revision=>revision.id===link?.revisionId)?.capture;
      setCaptures({before:capture(before),after:capture(after)});
    });
    return()=>{active=false;};
  },[job.scope,before,after]);
  if(!before||!after)return null;
  return <details className='mt-2'>
    <summary className='cursor-pointer'>Compare saved revisions</summary>
    {captures.error&&<p role='alert'>{captures.error}</p>}
    <div className='mt-2 grid gap-2 sm:grid-cols-2'>
      {[{label:'Before QA feedback',source:captures.before},{label:'After revision',source:captures.after}].map(({label,source})=><figure key={label} className='min-w-0'>
        <figcaption className='mb-1 text-muted-foreground'>{label}</figcaption>
        {source?<img src={source} alt={label} loading='lazy' className='w-full rounded-md'/>:<p>Screenshot unavailable</p>}
      </figure>)}
    </div>
  </details>;
}

function TaskDetail({task,settings,onRun,onStop,onSave,onOpenDoc,onDecide,onReview}:{task:WorkspaceTask;settings:Settings;onRun:()=>void;onStop:()=>void;onSave:(update:(task:WorkspaceTask)=>WorkspaceTask)=>void;onOpenDoc:(id:string)=>void;onDecide:(id:string,choice:PermissionChoice|null)=>void;onReview:()=>void}){
  const [editing,setEditing]=React.useState(false),[draft,setDraft]=React.useState(task.description),[completion,setCompletion]=React.useState(false),[done,setDone]=React.useState(''),[product,setProduct]=React.useState('');
  const busy=task.status==='In Progress';
  const job=task.designJob;
  const link=task.reviewItem??job?.code??job?.layout;
  return <div className='scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4'>
    <div className='flex flex-wrap items-center gap-2'><Badge variant={priorityVariant[task.priority]??'medium'}>{task.priority}</Badge>{task.tags.map(tag=><Badge key={tag}>{tag}</Badge>)}<div className='ml-auto flex flex-wrap gap-1.5'>{busy?<Button size='sm' variant='secondary' onClick={onStop}><Square/>Stop task</Button>:<>{(!job||!job.intent&&job.phase!=='verified')&&<Button size='sm' variant='ghost' onClick={()=>setEditing(v=>!v)}>Edit task</Button>}{task.status==='Failed'&&<Button size='sm' variant='secondary' onClick={()=>onSave(t=>({...t,status:'To Do',error:undefined}))}>Return to To Do</Button>}{job?.phase!=='verified'&&<Button size='sm' onClick={onRun}><Play/>{task.attempts?'Run again':'Run task'}</Button>}</>}</div></div>
    {editing?<form className='mt-4 space-y-2' onSubmit={e=>{e.preventDefault();onSave(t=>({...t,description:draft,details:draft,designJob:t.designJob&&!t.designJob.intent?{...t.designJob,brief:draft}:t.designJob}));setEditing(false);}}><textarea className={area} aria-label='Edit task description' value={draft} onChange={e=>setDraft(e.target.value)}/><Button size='sm' type='submit' disabled={!draft.trim()}>Save task</Button></form>:<p className='mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground'>{task.description}</p>}
    {task.error&&<p role='alert' className='mt-4 whitespace-pre-wrap break-words rounded-lg border border-destructive/40 p-3 text-sm text-destructive'>{task.error}</p>}
    {(job||link)&&<section className='mt-4 space-y-2 rounded-lg border border-border p-3 text-xs'>
      {job&&<p>Design job · {job.phase} · version {job.version}</p>}
      {job&&!busy&&!job.worktree&&job.phase!=='verified'&&<label className='flex items-center gap-2'>
        <input type='checkbox' checked={job.isolate===true} onChange={event=>{const isolate=event.target.checked;onSave(current=>current.designJob?{...current,designJob:{...current.designJob,isolate}}:current);}}/>
        Use a Git worktree
      </label>}
      {job?.worktree&&<p className='break-all'>Worktree {job.worktree}</p>}
      {job?.verdict&&<ul className='list-disc space-y-1 pl-4'>{job.verdict.findings.map((finding,index)=><li key={index}>{finding}</li>)}</ul>}
      {job?.previousPreviews?.length?<DesignComparison job={job}/>:null}
      {task.reviewItem&&<p className='break-all'>{task.reviewItem.resolved?'Resolved':'Open'} · {task.reviewItem.anchor.selector??`${Math.round(task.reviewItem.anchor.x)}, ${Math.round(task.reviewItem.anchor.y)}`}</p>}
      {link&&<Button size='sm' variant='secondary' onClick={onReview}>Open linked revision</Button>}
    </section>}
    <div className='mt-5 space-y-5 border-y border-border py-5'>
      <section><h3 className='text-sm font-medium'>{task.status==='Done'?'What was done':'What this means'}</h3><ol className='mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted-foreground'>{(task.status==='Done'?[task.whatWasDone||'']:task.details.split(/\n+/)).filter(Boolean).map((text,i)=><li key={i} className='whitespace-pre-wrap break-words'>{text.replace(/^\d+[.)]\s*/,'')}</li>)}</ol></section>
      <section><h3 className='text-sm font-medium'>{task.status==='Done'?'The final product':'Planned solution'}</h3>{task.status==='Done'?<p className='mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground'>{task.finalProduct}</p>:<ol className='mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted-foreground'>{task.solution.map((step,i)=><li key={i}>{step.replace(/^\d+[.)]\s*/,'')}</li>)}</ol>}</section>
      {task.status==='Done'&&<details><summary className='cursor-pointer text-xs text-muted-foreground'>Original plan</summary><ol className='mt-2 list-decimal pl-5 text-sm text-muted-foreground'>{task.solution.map((step,i)=><li key={i}>{step}</li>)}</ol></details>}
      {!busy&&!job&&task.status!=='Done'&&<Button size='sm' variant='ghost' onClick={()=>setCompletion(v=>!v)}>Record completed work</Button>}
      {completion&&<form className='space-y-2' onSubmit={e=>{e.preventDefault();onSave(t=>completeTask(t,done,product));setCompletion(false);}}><textarea className={area} aria-label='What was done' placeholder='Describe what was actually done.' value={done} onChange={e=>setDone(e.target.value)}/><textarea className={area} aria-label='The final product' placeholder='Describe the final product and verification.' value={product} onChange={e=>setProduct(e.target.value)}/><Button type='submit' size='sm' disabled={!done.trim()||!product.trim()}>Mark Done</Button></form>}
    </div>
    <h3 className='mt-5 text-sm font-medium'>Execution and artifacts</h3>
    {!task.messages.length&&<p className='mt-2 text-sm text-muted-foreground'>Run this task to plan and use tools here. All outputs and documents are saved with the task.</p>}
    <div className='mt-4 space-y-5'>{task.messages.map(message=><MessageItem key={message.id} message={message} agentLabel={id=>settings.agents.find(a=>a.id===id)?.name??id} onRevert={()=>{}} revertEnabled={false} retryEnabled={false} busy={busy} onDecide={onDecide} onOpenDoc={onOpenDoc} docForMessage={id=>artifactDocument(task.messages.find(m=>m.id===id))?.text}/>)}</div>
  </div>;
}
