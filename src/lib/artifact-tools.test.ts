import { describe, expect, it } from 'vitest';
import { createArtifactDesign, createArtifactDesignRepository } from './artifact-design';
import { executeArtifactTool } from './artifact-tools';
import { ProfessionalToolRuntime, type RuntimeOptions } from './professional-runtime';
import { createReviewRepository, revisePreview } from './review-store';
import { executeReviewTool } from './review-tools';
import { auditFixture } from './test-fixtures/artifact-audit';
import type { BrowserCapture } from './review-browser';

function setup(){
  const saved=new Map<string,string>();
  const repository=createArtifactDesignRepository({read:async key=>saved.get(key)??null,write:async(key,value)=>{saved.set(key,value);}});
  return {repository};
}
describe('artifact generation tools',()=>{
  it('exports the saved project identity into subsequent artifacts and isolates other workspaces',async()=>{
    const {repository}=setup(),context={workspace:'A:/brand',readOnly:false,planning:false};
    await executeArtifactTool({action:'save',design:createArtifactDesign('expressive'),expected_revision:0},context,{repository});
    const second=await executeArtifactTool({action:'template',template:'dashboard'},context,{repository});
    expect(second.text).toContain('#702c91');
    expect(second.text).toContain('data-taro-layer');
    const other=await executeArtifactTool({action:'read'},{...context,workspace:'A:/other'},{repository});
    expect(JSON.parse(other.text).saved).toBe(false);
    const same=await executeArtifactTool({action:'read'},{...context,workspace:'a:\\brand\\'},{repository});
    expect(JSON.parse(same.text).design.direction).toBe('expressive');
  });
  it('allows read-only and planning exports but blocks project memory updates',async()=>{
    const {repository}=setup();
    for(const flags of [{readOnly:true,planning:false},{readOnly:false,planning:true}]){
      const context={workspace:'A:/brand',...flags};
      await expect(executeArtifactTool({action:'save',design:createArtifactDesign(),expected_revision:0},context,{repository})).rejects.toThrow(/read.only|plan mode/i);
      expect((await executeArtifactTool({action:'export'},context,{repository})).text).toContain('--art-accent');
    }
    expect(await repository.read('A:/brand')).toBeNull();
  });
  it('routes artifact tools through runtime permissions and makes the design loop available to the model',async()=>{
    const {repository}=setup();
    const options:RuntimeOptions={sessionId:'artifact-runtime',workspaceRoot:'A:/brand',agentId:'designer',model:{id:'m',label:'Model',endpoint:'http://model'},models:[],plugins:[],agents:[{id:'designer',name:'Designer',role:'Designer',model:'m',enabled:true,autonomy:'suggest',canWriteCode:false}],artifactServices:{repository},native:async()=>{throw Error('Unexpected native mutation');},stream:async()=>[],stopRequest:async()=>{},approve:async()=>false,emit:()=>{},updateChild:()=>{}};
    const runtime=new ProfessionalToolRuntime(options);
    expect(runtime.definitions().some(t=>t.function.name==='ArtifactDesign')).toBe(true);
    expect(runtime.instructions()).toContain('BrowserAudit');
    await expect(runtime.execute({id:'write',name:'ArtifactDesign',arguments:'{}'},{action:'save',design:createArtifactDesign(),expected_revision:0})).rejects.toThrow(/read.only/i);
    expect((await runtime.execute({id:'read',name:'ArtifactDesign',arguments:'{}'},{action:'read'})).text).toContain('componentContract');
  });
  it('blocks design saves from an already-running writable child when an ancestor enters plan mode',async()=>{
    const {repository}=setup();
    let release!:(value:{id:string;name:string;arguments:string}[])=>void,started!:()=>void,first=true;
    const waiting=new Promise<void>(resolve=>{started=resolve;});
    const options:RuntimeOptions={sessionId:'artifact-plan-ancestor',workspaceRoot:'A:/brand-plan',agentId:'code',model:{id:'m',label:'Model',endpoint:'http://model'},models:[],plugins:[],artifactServices:{repository},native:async(tool,_input,owner)=>tool.name==='EnterPlanMode'?{text:'Planning',artifact:{kind:'plan-mode',path:'plan.md'}}:{text:'Authorized',artifact:{kind:'agent-authorization',workspaceRoot:owner.workspaceRoot}},stream:async()=>{if(first){first=false;started();return new Promise(resolve=>{release=resolve;});}return [];},stopRequest:async()=>{},approve:async()=>true,emit:()=>{},updateChild:()=>{}};
    const runtime=new ProfessionalToolRuntime(options);
    const launched=await runtime.execute({id:'agent',name:'Agent',arguments:'{}'},{description:'Design update',prompt:'Update design',run_in_background:true});
    await waiting;
    await runtime.execute({id:'plan',name:'EnterPlanMode',arguments:'{}'},{});
    release([{id:'save',name:'ArtifactDesign',arguments:JSON.stringify({action:'save',design:createArtifactDesign(),expected_revision:0})}]);
    await runtime.execute({id:'wait',name:'TaskOutput',arguments:'{}'},{task_id:launched.artifact.task_id,block:true,timeout:1000});
    expect(await repository.read('A:/brand-plan')).toBeNull();
  });
});

describe('agent visual verification loop',()=>{
  it('stores measured evidence on the revision audited during a concurrent revision change and exposes each screenshot',async()=>{
    const context={scope:{workspace:'A:/brand',sessionId:'audit-tool'},author:'Designer',role:'Designer'};
    const repository=createReviewRepository({read:async()=>null,write:async()=>{}});
    const capture:BrowserCapture={url:'about:blank',title:'Test',viewport:{width:920,height:720},document:{width:920,height:720,scrollX:0,scrollY:0},components:[],anchors:{},screenshot:'data:image/png;base64,original'};
    const services={repository,browser:async(request:{action:string})=>{
      if(request.action==='audit'){
        const p=repository.snapshot(context.scope).state.previews[0];
        await repository.change(context.scope,state=>revisePreview(state,p.id,{html:'new'},'new-revision'));
        return {...capture,audit:auditFixture()};
      }
      return capture;
    }};
    await executeReviewTool('BrowserPreview',{html:'original'},context,services);
    const original=repository.snapshot(context.scope).state.previews[0];
    await executeReviewTool('BrowserAudit',{},context,services);
    const preview=repository.snapshot(context.scope).state.previews[0];
    expect(preview.revisions[0].audits).toHaveLength(1);expect(preview.revisions[1].audits).toBeUndefined();
    const {selectPreview}=await import('./review-store');
    await repository.change(context.scope,state=>selectPreview(state,preview.id,original.revisionId));
    const evidence=await executeReviewTool('BrowserAudit',{run:false,case_index:7},context,services);
    expect(evidence.artifact.dataUrl).toBe('data:image/png;base64,example');
    expect(evidence.text).toContain('reduced-motion');
  });
});
