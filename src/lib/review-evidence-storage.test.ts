import { describe, expect, it } from 'vitest';
import { createReviewEvidenceStorage } from './review-evidence-storage';

describe('browser review evidence storage',()=>{
  it('moves screenshot-heavy reports to durable large storage and reads them after restart',async()=>{
    const small=new Map<string,string>(),large=new Map<string,string>();
    const local={getItem:(key:string)=>small.get(key)??null,setItem:(key:string,value:string)=>{small.set(key,value);},removeItem:(key:string)=>{small.delete(key);}};
    const durable={read:async(key:string)=>large.get(key)??null,write:async(key:string,value:string)=>{large.set(key,value);}};
    const store=createReviewEvidenceStorage(local,durable);
    await store.write('project','{"previews":[]}');
    expect(small.get('taro-review-v1:project')).toBe('{"previews":[]}');
    const evidence='{"audits":[{"screenshot":"large"}]}';
    await store.write('project',evidence);
    expect(small.has('taro-review-v1:project')).toBe(false);
    const restarted=createReviewEvidenceStorage(local,durable);
    expect(await restarted.read('project')).toBe(evidence);
    await restarted.write('project','{"later":"revision"}');
    expect(await store.read('project')).toBe('{"later":"revision"}');
  });
  it('falls back to large storage on quota errors without losing earlier saved data on failure',async()=>{
    let original='original',saved:string|null=null;
    const local={getItem:()=>original,setItem:()=>{throw Error('Quota exceeded');},removeItem:()=>{original='';}};
    const store=createReviewEvidenceStorage(local,{read:async()=>saved,write:async()=>{throw Error('Disk unavailable');}});
    await expect(store.write('project','new')).rejects.toThrow('Disk unavailable');
    expect(await store.read('project')).toBe('original');
    const recovered=createReviewEvidenceStorage(local,{read:async()=>saved,write:async(_,value)=>{saved=value;}});
    await recovered.write('project','new');
    expect(await recovered.read('project')).toBe('new');
  });
});
