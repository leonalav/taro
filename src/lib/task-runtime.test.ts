import {describe,it,expect,vi} from 'vitest';
import {createTaskRepository,createTask} from './task-store';
import {createTaskExecutor} from './task-runtime';
import {defaultSettings} from '@/data/settings';

describe('task-owned execution',()=>{
  it('starts the Designer on the same board task when the task is an interface build',async()=>{
    const workspace='path:a:/test';
    let saved:string|null=null;
    const repository=createTaskRepository({read:async()=>saved,write:async(_key,value)=>{saved=value;}});
    await repository.add(workspace,createTask('Build a responsive dashboard','design'));
    const stream=vi.fn(async()=>[]);
    const native=vi.fn(async()=>({text:'Authorized',artifact:{kind:'agent-authorization',workspaceRoot:'A:/test'}}));
    const executor=createTaskExecutor(repository,{stream,native,stop:async()=>{},listMcp:async()=>({tools:[]})});
    const agents=['Orchestrator','Designer','Code','Type & QA'].map(role=>({id:role,name:role,role,model:'m',enabled:true,autonomy:'auto' as const,canWriteCode:true}));
    const settings={...defaultSettings,agents,models:{...defaultSettings.models,customModels:[{id:'m',label:'m',endpoint:'http://localhost/v1'}],defaultModel:'m'}};
    vi.stubGlobal('localStorage',{getItem:()=>null});
    try{await executor.start(workspace,'design','A:/test',settings);}
    finally{vi.unstubAllGlobals();}
    const [task]=repository.snapshot(workspace).tasks;
    expect(repository.snapshot(workspace).tasks).toHaveLength(1);
    expect(task.designJob).toMatchObject({phase:'interrupted',brief:expect.stringContaining('Build a responsive dashboard')});
    expect(task.error).toContain('structured handoff');
    expect(task.messages).toContainEqual(expect.objectContaining({role:'subagent',subagentType:'Designer'}));
  });
  it('stops a stalled model and preserves its partial text',async()=>{
    const repository=createTaskRepository({read:async()=>null,write:async()=>{}});await repository.load('root');await repository.add('root',createTask('Stop','stop'));
    let started=false;
    const executor=createTaskExecutor(repository,{stream:async(_input,delta)=>{delta('Partial result');started=true;return new Promise(()=>{});},native:async()=>({text:'Stopped scopes',artifact:{kind:'task-stop'}}),stop:async()=>{},listMcp:async()=>({tools:[]})});
    const settings={...defaultSettings,agents:[],models:{...defaultSettings.models,customModels:[{id:'m',label:'m',endpoint:'http://localhost/v1'}],defaultModel:'m'}};
    const running=executor.start('root','stop','A:/test',settings);await vi.waitFor(()=>expect(started).toBe(true));await executor.stop('root','stop');await running;
    expect(repository.snapshot('root').tasks[0].status).toBe('Failed');expect(JSON.stringify(repository.snapshot('root').tasks[0].messages)).toContain('Partial result');
  });
  it('does not dispatch an approved write if stopped during intent persistence',async()=>{
    let release!:()=>void,held=false;
    const repository=createTaskRepository({read:async()=>null,write:async(_k,value)=>{if(!held&&value.includes('"executions"')&&value.includes('"name":"Write"')){held=true;await new Promise<void>(resolve=>{release=resolve;});}}});
    await repository.load('root');await repository.add('root',createTask('Stop before write','stop'));
    const native=vi.fn().mockResolvedValue({text:'cleanup',artifact:{kind:'task-stop'}});
    const executor=createTaskExecutor(repository,{stream:async()=>[{id:'write',name:'Write',arguments:'{"file_path":"x","content":"x"}'}],native,stop:async()=>{},listMcp:async()=>({tools:[]})});
    const settings={...defaultSettings,agents:[],models:{...defaultSettings.models,customModels:[{id:'m',label:'m',endpoint:'http://localhost/v1'}],defaultModel:'m'}};
    const running=executor.start('root','stop','A:/test',settings);
    await vi.waitFor(()=>expect(repository.snapshot('root').tasks[0].messages.some(m=>m.role==='permission')).toBe(true));
    const permission=repository.snapshot('root').tasks[0].messages.find(m=>m.role==='permission')!;
    await executor.decide('root','stop',permission.id,{allowed:true,label:'Allow once',target:'tool',duration:'once'});
    await vi.waitFor(()=>expect(held).toBe(true));const stopping=executor.stop('root','stop');release();await stopping;await running;
    expect(native.mock.calls.some(([call])=>call.name==='Write')).toBe(false);
  });
  it('keeps tool calls, outputs, and completion descriptions on the task',async()=>{
    const repository=createTaskRepository({read:async()=>null,write:async()=>{}});await repository.load('root');await repository.add('root',createTask('Fix validation','fix'));
    const stream=vi.fn().mockImplementationOnce(async(_input,delta)=>{delta('Inspecting validation.');return [{id:'meta',name:'TaskUpdate',arguments:JSON.stringify({priority:'High',tags:['validation'],description:'Fix invalid input',details:'Invalid input is accepted.',solution:['Inspect validation.','Reject invalid input and run tests.']})}];}).mockImplementationOnce(async()=>[{id:'read',name:'Read',arguments:'{"file_path":"src/form.ts"}'}]).mockImplementationOnce(async()=>[{id:'done',name:'TaskComplete',arguments:'{"whatWasDone":"Verified validation","finalProduct":"The form rejects invalid input."}'}]);
    const executor=createTaskExecutor(repository,{stream,native:async()=>({text:'Actual file content',artifact:{kind:'read'}}),stop:async()=>{},listMcp:async()=>({tools:[]})});
    const settings={...defaultSettings,agents:[],models:{...defaultSettings.models,customModels:[{id:'model',label:'test-model',endpoint:'http://localhost:1234/v1'}],defaultModel:'model'}};
    await executor.start('root','fix','A:/test',settings);
    const task=repository.snapshot('root').tasks[0];
    expect(task.status).toBe('Done');expect(task.finalProduct).toBe('The form rejects invalid input.');expect(task.tags).toEqual(['validation']);
    expect(JSON.stringify(task.messages)).toContain('Actual file content');
    expect(task.messages.some(m=>m.role==='agent'&&m.text.includes('Inspecting validation.'))).toBe(true);
  });
  it('never marks an empty or failed provider response Done',async()=>{
    const repository=createTaskRepository({read:async()=>null,write:async()=>{}});await repository.load('root');await repository.add('root',createTask('Fix','fix'));
    const executor=createTaskExecutor(repository,{stream:async()=>[],native:async()=>({text:'',artifact:{kind:'read'}}),stop:async()=>{},listMcp:async()=>({tools:[]})});
    const settings={...defaultSettings,agents:[],models:{...defaultSettings.models,customModels:[{id:'model',label:'test',endpoint:'http://localhost/v1'}],defaultModel:'model'}};
    await executor.start('root','fix','A:/test',settings);
    expect(repository.snapshot('root').tasks[0]).toMatchObject({status:'Failed'});
    expect(repository.snapshot('root').tasks[0].error).toMatch(/completion|empty/i);
  });
  it('rejects simultaneous starts in a workspace and completion followed by further tools',async()=>{
    const repository=createTaskRepository({read:async()=>null,write:async()=>{}});await repository.load('root');const task=createTask('Fix','fix');task.tags=['fix'];await repository.add('root',task);
    const executor=createTaskExecutor(repository,{stream:async()=>[{id:'done',name:'TaskComplete',arguments:'{"whatWasDone":"Checked","finalProduct":"Done"}'},{id:'write',name:'Write',arguments:'{"file_path":"x","content":"x"}'}],native:async()=>{throw Error('must not write');},stop:async()=>{},listMcp:async()=>({tools:[]})});
    const settings={...defaultSettings,agents:[],models:{...defaultSettings.models,customModels:[{id:'model',label:'test',endpoint:'http://localhost/v1'}],defaultModel:'model'}};
    const first=executor.start('root','fix','A:/test',settings);
    await expect(executor.start('root','fix','A:/test',settings)).rejects.toThrow(/another task/i);
    await first;
    expect(repository.snapshot('root').tasks[0].status).toBe('Failed');
  });
});
