import { describe, expect, it, vi } from 'vitest';
import { createReviewRepository, revisePreview, selectPreview } from './review-store';
import { executeReviewTool, type ReviewServices } from './review-tools';
import { ProfessionalToolRuntime, type RuntimeOptions } from './professional-runtime';
const scope={workspace:'A:/review',sessionId:'review-test'};
function setup(){
  const saved=new Map<string,string>();const repository=createReviewRepository({read:async key=>saved.get(key)??null,write:async(key,value)=>{saved.set(key,value);}});
  const browser:ReviewServices['browser']=vi.fn().mockResolvedValue({url:'http://localhost:3000',title:'Page',viewport:{width:920,height:720},document:{width:920,height:1200,scrollX:0,scrollY:0},components:[{selector:'#hero',tag:'h1',text:'Hero',rect:{x:20,y:40,width:400,height:96},styles:{fontSize:'48px'}}],selection:{selector:'#hero',tag:'h1',text:'Hero',rect:{x:20,y:40,width:400,height:96},styles:{fontSize:'48px'}},anchors:{},screenshot:'data:image/png;base64,example',source:'<h1 id="hero">Hero</h1>'});
  const notify=vi.fn();return {services:{repository,browser,notify},repository,browser,notify};
}
describe('agent-callable browser reviews',()=>{
  it('opens previews and preserves immutable sources and revisions',async()=>{
    const {services,repository,browser}=setup();
    const context={scope,author:'Aria',role:'Designer'};
    const html='<!doctype html>\r\n<h1 id="hero">Original</h1>';
    const result=await executeReviewTool('BrowserPreview',{html,title:'Artifact'},context,services);
    const preview=repository.snapshot(scope).state.previews[0];expect(preview.revisions[0].html).toBe(html);
    expect(preview.revisions[0].observation?.components[0].rect).toEqual({x:20,y:40,width:400,height:96});
    expect(result.artifact).toMatchObject({kind:'image',dataUrl:'data:image/png;base64,example',previewId:preview.id});
    await executeReviewTool('BrowserPreview',{html:'New',preview_id:preview.id},context,services);
    expect(repository.snapshot(scope).state.previews[0].revisions).toHaveLength(2);
    expect(repository.snapshot(scope).state.previews[0].revisions[0].html).toBe(html);
    expect(browser).toHaveBeenCalled();
  });
  it('stores agent identity from context and keeps full comment/reply/resolve history',async()=>{
    const {services,repository}=setup();const context={scope,author:'Theo',role:'Type & QA'};
    await executeReviewTool('BrowserPreview',{url:'http://localhost:3000'},context,services);
    await executeReviewTool('BrowserComment',{body:'Use **bold**, *italic*, and `code`.',selector:'#hero',author:'Spoof',session_id:'foreign'},context,services);
    const p=repository.snapshot(scope).state.previews[0],thread=p.threads[0];
    expect(thread.messages[0].author).toBe('Theo');expect(thread.anchor).toMatchObject({selector:'#hero',x:220,y:88});
    await executeReviewTool('BrowserComment',{thread_id:thread.id,body:'Reply'},context,services);
    await executeReviewTool('BrowserComment',{thread_id:thread.id,resolved:true},context,services);
    const listed=await executeReviewTool('BrowserComments',{include_resolved:true},context,services);
    expect(listed.text).toContain('Reply');expect(repository.snapshot(scope).state.previews[0].threads[0].resolved).toBe(true);
    await expect(executeReviewTool('BrowserComments',{preview_id:p.id},{...context,scope:{...scope,sessionId:'other'}},services)).rejects.toThrow(/preview/i);
  });
  it('retains supplied artifacts when the browser cannot start',async()=>{
    const {services,repository}=setup();services.browser=vi.fn().mockRejectedValue(Error('Browser unavailable'));
    await expect(executeReviewTool('BrowserPreview',{html:'<h1>Do not lose this</h1>',title:'Retained'},{scope,author:'Aria',role:'Designer'},services)).rejects.toThrow('Browser unavailable');
    expect(repository.snapshot(scope).state.previews[0]?.revisions[0].html).toBe('<h1>Do not lose this</h1>');
  });
  it('can change preview source kind without breaking older revisions',async()=>{
    const {services,repository}=setup(),context={scope,author:'Aria',role:'Designer'};
    await executeReviewTool('BrowserPreview',{url:'http://localhost:3000'},context,services);
    const id=repository.snapshot(scope).state.activeId;
    await executeReviewTool('BrowserPreview',{preview_id:id,html:'<h1>HTML revision</h1>'},context,services);
    expect(repository.snapshot(scope).state.previews[0].kind).toBe('html');
    const prior=repository.snapshot(scope).state.previews[0].revisions[0];
    await repository.change(scope,state=>selectPreview(state,id!,prior.id));
    expect(repository.snapshot(scope).state.previews[0].kind).toBe('url');
  });
  it('attaches a delayed measured comment to the revision that was inspected',async()=>{
    const {services,repository}=setup(),context={scope,author:'Theo',role:'Type & QA'};
    await executeReviewTool('BrowserPreview',{html:'Original'},context,services);
    const original=repository.snapshot(scope).state.previews[0],capture=await services.browser({key:'fixture',action:'capture'});
    let finish!:(value:Awaited<ReturnType<ReviewServices['browser']>>)=>void;
    services.browser=vi.fn().mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=executeReviewTool('BrowserComment',{body:'About original',selector:'#hero'},context,services);
    await vi.waitFor(()=>expect(finish).toBeDefined());
    await repository.change(scope,state=>revisePreview(state,original.id,{html:'New revision'}));finish(capture);await pending;
    expect(repository.snapshot(scope).state.previews[0].threads[0].revisionId).toBe(original.revisionId);
  });
  it('exposes real callable schemas and routes read-only designer tools with root session scope',async()=>{
    const {services,repository}=setup();
    const options:RuntimeOptions={sessionId:scope.sessionId,workspaceRoot:scope.workspace,agentId:'designer',model:{id:'m',label:'Model',endpoint:'http://model'},models:[],plugins:[],agents:[{id:'designer',name:'Aria',role:'Designer',model:'m',enabled:true,autonomy:'suggest',canWriteCode:false}],reviewServices:services,native:async()=>{throw Error('Review should not dispatch workspace mutations');},stream:async()=>[],stopRequest:async()=>{},approve:async()=>false,emit:()=>{},updateChild:()=>{}};
    const runtime=new ProfessionalToolRuntime(options);
    expect(runtime.definitions().some(d=>d.function.name==='BrowserPreview')).toBe(true);
    await runtime.execute({id:'preview',name:'BrowserPreview',arguments:'{}'},{html:'<h1>Read only review</h1>'});
    await runtime.execute({id:'comment',name:'BrowserComment',arguments:'{}'},{body:'Recommendation',x:10,y:20});
    expect(repository.snapshot(scope).state.previews[0].threads[0].messages[0].author).toBe('Aria');
  });
});
