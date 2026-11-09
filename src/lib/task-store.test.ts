import {describe,it,expect} from 'vitest';
import {createTaskRepository,createTask,restoreTasks,completeTask} from './task-store';

describe('durable task boards',()=>{
  it('recovers interrupted tasks without losing tool outputs or artifacts',()=>{
    const task={...createTask('Fix checkout','t1'),status:'In Progress',messages:[{id:'doc',role:'plan',agentId:'rin',name:'Plan',path:'docs/fix.md',markdown:'# User edited artifact',kind:'Plan'}]};
    const restored=restoreTasks(JSON.stringify([task]));
    expect(restored[0].status).toBe('Failed');
    expect(restored[0].error).toMatch(/interrupted/i);
    expect(restored[0].messages).toEqual(task.messages);
  });
  it('serializes concurrent writes and isolates workspaces',async()=>{
    const disk=new Map<string,string>();
    const repository=createTaskRepository({read:async k=>disk.get(k)??null,write:async(k,v)=>{disk.set(k,v);}});
    await Promise.all([repository.load('A'),repository.load('B')]);
    await repository.add('A',createTask('One','one'));
    await Promise.all([repository.mutate('A','one',t=>({...t,description:'Edited'})),repository.mutate('A','one',t=>({...t,tags:['fix']}))]);
    expect(repository.snapshot('A').tasks[0]).toMatchObject({description:'Edited',tags:['fix']});
    expect(repository.snapshot('B').tasks).toEqual([]);
    const reloaded=createTaskRepository({read:async k=>disk.get(k)??null,write:async(k,v)=>{disk.set(k,v);}});
    await reloaded.load('A');
    expect(reloaded.snapshot('A').tasks[0].description).toBe('Edited');
  });
  it('requires completion descriptions and keeps the original plan',()=>{
    const task=createTask('Fix','t');
    expect(()=>completeTask(task,'','')).toThrow(/description/i);
    const done=completeTask(task,'Fixed validation','The form shows a useful error.');
    expect(done.status).toBe('Done');
    expect(done.solution).toEqual(task.solution);
    expect(done.finalProduct).toBe('The form shows a useful error.');
  });
  it('surfaces a failed durable write without falsely publishing new task state',async()=>{
    const repo=createTaskRepository({read:async()=>null,write:async()=>{throw Error('disk full');}});
    await repo.load('root');
    await expect(repo.add('root',createTask('Keep','keep'))).rejects.toThrow('disk full');
    expect(repo.snapshot('root').tasks).toEqual([]);
    expect(repo.snapshot('root').error).toMatch(/disk full/);
  });
  it('does not overwrite corrupt persisted artifacts with an empty board',async()=>{
    const repo=createTaskRepository({read:async()=>'{broken',write:async()=>{throw Error('must not write');}});
    await repo.load('root');
    expect(repo.snapshot('root').error).toMatch(/read|invalid|corrupt/i);
    await expect(repo.add('root',createTask('No overwrite','no'))).rejects.toThrow();
  });
  it('retains unsaved execution evidence and retries saving after storage recovers',async()=>{
    let fail=false;const disk=new Map<string,string>();const repo=createTaskRepository({read:async k=>disk.get(k)??null,write:async(k,v)=>{if(fail)throw Error('disk full');disk.set(k,v);}});
    await repo.load('root');await repo.add('root',createTask('Keep result','keep'));fail=true;
    await expect(repo.mutate('root','keep',t=>({...t,messages:[{id:'output',role:'event',text:'Actual output after side effect'}]}))).rejects.toThrow();
    expect(repo.snapshot('root').unsavedTasks?.[0].messages[0]).toMatchObject({text:'Actual output after side effect'});
    fail=false;await repo.retrySave('root');
    expect(repo.snapshot('root').tasks[0].messages[0]).toMatchObject({text:'Actual output after side effect'});
  });
});
