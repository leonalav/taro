import {describe,it,expect} from 'vitest';
import {createActivityStore,activityHeatmap,getActivitySnapshot,recordDesignActivity} from './activity-store';
describe('real contributions',()=>{
  it('counts confirmed events once, persists them and leaves other days empty',()=>{
    const disk=new Map<string,string>();const storage={getItem:(k:string)=>disk.get(k)??null,setItem:(k:string,v:string)=>{disk.set(k,v);}};
    const now=new Date(2026,10,9,12).getTime();
    const store=createActivityStore(storage,()=>now);
    expect(store.record({id:'tool-1',workspace:'root',kind:'code',timestamp:now})).toBe(true);
    expect(store.record({id:'tool-1',workspace:'root',kind:'code',timestamp:now})).toBe(false);
    expect(store.record({id:'future',workspace:'root',kind:'code',timestamp:now+1000000})).toBe(false);
    const days=activityHeatmap(store.snapshot(),1,new Date(now));
    expect(days.find(d=>d.date==='2026-11-09')?.count).toBe(1);
    expect(days.filter(d=>d.date!=='2026-11-09').every(d=>d.count===0)).toBe(true);
    expect(createActivityStore(storage,()=>now).snapshot()).toHaveLength(1);
  });
});

it('preserves malformed saved activity while retaining new confirmed events',()=>{
  let raw='{broken history';const writes:string[]=[];
  const store=createActivityStore({getItem:()=>raw,setItem:(_key,value)=>{writes.push(value);raw=value;}});
  const event={id:'retained',workspace:'root',kind:'code' as const,timestamp:Date.now()};
  expect(store.storageStatus()).toMatchObject({needsRepair:true});
  expect(store.record(event)).toBe(true);expect(store.snapshot()).toContainEqual(event);expect(writes).toEqual([]);expect(raw).toBe('{broken history');
  expect(store.retryPersistence()).toBe(false);expect(raw).toBe('{broken history');
  expect(store.storageStatus()).toMatchObject({unsaved:true,needsRepair:true});
  raw='[]';expect(store.retryPersistence()).toBe(true);expect(JSON.parse(raw)).toEqual([event]);expect(store.storageStatus()).toEqual({error:null,unsaved:false,needsRepair:false});
});

it('keeps failed-write evidence and retries without changing a stable event snapshot',()=>{
  let raw='[]',fail=true;const store=createActivityStore({getItem:()=>raw,setItem:(_key,value)=>{if(fail)throw Error('disk full');raw=value;}});
  const event={id:'retained-failure',workspace:'root',kind:'task' as const,timestamp:Date.now()};
  let changes=0;store.subscribeStorageStatus(()=>{changes++;});
  store.record(event);const snapshot=store.snapshot();expect(snapshot).toEqual([event]);expect(raw).toBe('[]');expect(store.storageStatus()).toMatchObject({unsaved:true,needsRepair:false});expect(store.storageStatus().error).toMatch(/disk full/);
  fail=false;expect(store.retryPersistence()).toBe(true);expect(JSON.parse(raw)).toEqual([event]);expect(store.snapshot()).toBe(snapshot);expect(changes).toBeGreaterThan(0);expect(store.storageStatus().unsaved).toBe(false);
});

it('counts an unchanged design preview once and a changed revision as a new event',()=>{
  const workspace='design-dedup-test';const before=getActivitySnapshot().filter(event=>event.workspace===workspace).length;
  expect(recordDesignActivity({workspace,path:'A:\\work\\docs\\plan.md',markdown:'# Design\r\nLayout'})).toBe(true);
  expect(recordDesignActivity({workspace,path:'a:/work/docs/plan.md',markdown:'# Design\nLayout'})).toBe(false);
  expect(recordDesignActivity({workspace,path:'A:/work/docs/plan.md',markdown:'# Design\nRevised layout'})).toBe(true);
  expect(getActivitySnapshot().filter(event=>event.workspace===workspace)).toHaveLength(before+2);
});
