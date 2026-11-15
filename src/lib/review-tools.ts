import type { ToolOutput } from './agent-tools';
import { validateArtifactAudit } from './artifact-audit';
import { artifactDesignRepository } from './artifact-design-persistence';
import type { ArtifactDesignRepository } from './artifact-design';
import { reviewRepository } from './review-persistence';
import { createReviewAnchor } from './review-anchors';
import { syncReviewWorkItem } from './review-work-items';
import { createReviewCommentService } from './review-comment-service';
import { browserPreviewKey, publishReviewCapture, requestReviewBrowser, type BrowserCapture, type BrowserRequest } from './review-browser';
import { activeRevision, addPreview, attachReviewCapture, attachArtifactAudit, previewById, revisePreview, reviewId, reviewScopeKey, selectPreview, setReviewViewport, validateViewport, type ReviewRepository, type ReviewScope } from './review-store';

export interface ReviewContext { scope:ReviewScope;author:string;role:string;signal?:AbortSignal }
export interface ReviewServices { repository:ReviewRepository;browser:(request:BrowserRequest)=>Promise<BrowserCapture>;designRepository?:ArtifactDesignRepository;notify?:(scope:ReviewScope)=>void;syncWorkItem?:typeof syncReviewWorkItem }
const commentServices=new WeakMap<ReviewServices,ReturnType<typeof createReviewCommentService>>();
export const defaultReviewServices:ReviewServices={repository:reviewRepository,browser:requestReviewBrowser,designRepository:artifactDesignRepository,syncWorkItem:syncReviewWorkItem,notify:scope=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('taro:review-open',{detail:scope}));}};
const inspectors=new Map<string,(request:BrowserRequest)=>Promise<BrowserCapture>>();
export function registerReviewInspector(key:string,inspect:(request:BrowserRequest)=>Promise<BrowserCapture>){inspectors.set(key,inspect);return()=>{inspectors.delete(key);};}
const cleanCapture=(capture:BrowserCapture)=>{const {screenshot:_,source:__,audit:___,...data}=capture;return data;};
export async function executeReviewTool(name:string,input:Record<string,unknown>,context:ReviewContext,services=defaultReviewServices):Promise<ToolOutput> {
  const {repository,browser}=services,{scope}=context;
  const assertActive=()=>{if(context.signal?.aborted)throw Error('Review tool stopped.');};
  assertActive();await repository.load(scope);const current=repository.snapshot(scope);if(!current.loaded)throw Error(current.error??'Review data could not be loaded.');
  const text=(value:unknown):ToolOutput=>({text:JSON.stringify(value),artifact:{kind:'browser',data:value}});
  if(name==='BrowserPreview'&&!input.url&&input.html===undefined&&!input.preview_id)return text({previews:current.state.previews.map(p=>({id:p.id,title:p.title,kind:p.kind,viewport:p.viewport,revisions:p.revisions.map(r=>({id:r.id,createdAt:r.createdAt,url:r.url})),openComments:p.threads.filter(t=>!t.resolved).length})),activeId:current.state.activeId});
  if(name==='BrowserPreview'&&(input.url||input.html!==undefined)){
    if(input.url&&input.html!==undefined)throw Error('Supply either url or html, not both.');
    if(input.html!==undefined&&typeof input.html!=='string')throw Error('HTML must be a string.');
    const existing=input.preview_id?previewById(current.state,String(input.preview_id)):undefined;
    if(existing?.kind==='nike')throw Error('The Nike reference is preserved. Open a new preview instead of replacing it.');
    const id=existing?.id??reviewId(),revisionId=reviewId();
    const viewport=validateViewport({width:input.width===undefined?existing?.viewport.width??920:Number(input.width),height:input.height===undefined?existing?.viewport.height??720:Number(input.height)});
    const key=browserPreviewKey(reviewScopeKey(scope),id,revisionId);
    const content={url:input.url===undefined?undefined:String(input.url),html:input.html as string|undefined};
    if(content.url){let url;try{url=new URL(content.url);}catch{throw Error('A complete HTTP(S) preview URL is required.');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Preview URLs must use HTTP(S) without embedded credentials.');}
    if(content.html!==undefined&&new TextEncoder().encode(content.html).length>6*1024*1024)throw Error('HTML artifacts must be under 6 MiB.');
    // Persist source before attempting browser startup, including when prerequisites are missing.
    try{await repository.change(scope,state=>existing?setReviewViewport(selectPreview(revisePreview(state,id,content,revisionId),id),id,viewport):addPreview(state,{...content,id,revisionId,title:String(input.title??(content.url?new URL(content.url).hostname:'HTML artifact')),kind:input.html===undefined?'url':'html',viewport}));}
    finally{services.notify?.(scope);}
    const capture=await browser({key,action:'open',...content,viewport});assertActive();
    publishReviewCapture(key,capture);
    await repository.change(scope,state=>attachReviewCapture(state,id,revisionId,{capture:capture.screenshot,source:capture.source,observation:cleanCapture(capture),title:!existing&&input.title===undefined?capture.title:undefined}));
    return {text:JSON.stringify({previewId:id,revisionId,...cleanCapture(capture)}),artifact:{kind:'image',browser:true,previewId:id,revisionId,dataUrl:capture.screenshot,path:String(input.title??capture.title??'Preview')}};
  }
  const preview=previewById(repository.snapshot(scope).state,input.preview_id===undefined?undefined:String(input.preview_id));
  const revision=input.expected_revision_id===undefined?activeRevision(preview):preview.revisions.at(-1)!;
  const key=browserPreviewKey(reviewScopeKey(scope),preview.id,revision.id);
  if(input.expected_revision_id!==undefined&&input.expected_revision_id!==revision.id)throw Error('The assigned preview revision is stale. Load the current job before continuing.');
  if(name==='BrowserAudit'){
    if(input.run===false){
      const assigned=input.expected_audit_id===undefined?undefined:revision.audits?.find(report=>report.id===input.expected_audit_id);
      if(input.expected_audit_id!==undefined&&!assigned)throw Error('The assigned audit is unavailable for this revision.');
      if(input.case_index!==undefined){
        const report=assigned??revision.audits?.at(-1),index=Number(input.case_index);
        if(!Number.isInteger(index)||index<0||index>7)throw Error('Audit case index must be an integer from 0 to 7.');
        const item=report?.cases[index];if(!item)throw Error('Run BrowserAudit on this revision before reading screenshots.');
        const {screenshot,...measured}=item;
        return {text:JSON.stringify({previewId:preview.id,revisionId:revision.id,reportId:report!.id,...measured}),artifact:{kind:'image',browser:true,previewId:preview.id,revisionId:revision.id,path:`${item.scheme} ${item.mode} visual check`,dataUrl:screenshot}};
      }
      return text({previewId:preview.id,revisionId:revision.id,reports:(assigned?[assigned]:revision.audits??[]).map(report=>({...report,cases:report.cases.map(({screenshot:_,...item})=>item)}))});
    }
    if(preview.kind==='nike')throw Error('Open a saved HTML artifact or URL to run visual checks. The reference canvas is not a browser revision.');
    const auditKey=browserPreviewKey(reviewScopeKey(scope),preview.id,`${revision.id}:audit:${reviewId()}`);
    const project=services.designRepository&&scope.workspace.trim()?await services.designRepository.read(scope.workspace):null;assertActive();
    try{
      await browser({key:auditKey,action:'open',isolated:true,...(revision.html!==undefined?{html:revision.html}:{url:revision.url}),viewport:preview.viewport});assertActive();
      const capture=await browser({key:auditKey,action:'audit',spacing:input.spacing as number[]|undefined??(project?Object.values(project.design.spacing):undefined)});assertActive();
      const report=validateArtifactAudit(capture.audit);
      await repository.change(scope,state=>attachArtifactAudit(state,preview.id,revision.id,report));services.notify?.(scope);
      const summary={previewId:preview.id,revisionId:revision.id,...report,cases:report.cases.map(({screenshot:_,...item})=>item)};
      return {text:JSON.stringify(summary),artifact:{kind:'image',browser:true,previewId:preview.id,revisionId:revision.id,path:`Visual checks · ${preview.title}`,audit:report,dataUrl:report.cases[0].screenshot}};
    }finally{await browser({key:auditKey,action:'close'}).catch(()=>{});}
  }
  const request=async(action:BrowserRequest['action'],extra:Partial<BrowserRequest>={}):Promise<BrowserCapture>=>{
    assertActive();const anchors=preview.threads.filter(t=>t.revisionId===revision.id&&t.anchor.selector).map(t=>t.anchor.selector!);
    const payload={key,action,anchors,...extra};
    if(preview.kind==='nike'){
      const inspector=inspectors.get(key);if(!inspector)throw Error('Open this session’s Nike reference in Review mode before inspecting its rendered components.');
      const capture=await inspector(payload);publishReviewCapture(key,capture);return capture;
    }
    let capture;
    try{capture=await browser(payload);}catch(error){if(!String(error).includes('Open a preview'))throw error;
      await browser({key,action:'open',url:revision.url,html:preview.kind==='html'?revision.html:undefined,viewport:preview.viewport});capture=await browser(payload);
    }
    assertActive();publishReviewCapture(key,capture);return capture;
  };
  if(name==='BrowserPreview'){
    await repository.change(scope,state=>selectPreview(state,preview.id));services.notify?.(scope);
    if(preview.kind==='nike')return text({previewId:preview.id,title:preview.title,message:'Nike reference opened. Use BrowserInspect after the Review canvas renders.'});
    const capture=await browser({key,action:'open',url:revision.url,html:preview.kind==='html'?revision.html:undefined,viewport:preview.viewport});publishReviewCapture(key,capture);
    return {text:JSON.stringify({previewId:preview.id,...cleanCapture(capture)}),artifact:{kind:'image',browser:true,previewId:preview.id,path:preview.title,dataUrl:capture.screenshot}};
  }
  if(name==='BrowserInspect'||name==='BrowserViewport'){
    const viewport=name==='BrowserViewport'?validateViewport({width:Number(input.width),height:Number(input.height)}):undefined;
    const capture=await request(viewport?'viewport':'inspect',{selector:input.selector===undefined?undefined:String(input.selector),...(viewport?{viewport}:{})});
    if(viewport)await repository.change(scope,state=>setReviewViewport(state,preview.id,viewport));
    return {text:JSON.stringify({previewId:preview.id,revisionId:revision.id,...cleanCapture(capture)}),artifact:{kind:capture.screenshot?'image':'browser',browser:true,previewId:preview.id,path:preview.title,...(capture.screenshot?{dataUrl:capture.screenshot}:{})}};
  }
  if(name==='BrowserComments')return text({previewId:preview.id,threads:preview.threads.filter(t=>input.include_resolved===true||!t.resolved)});
  if(name==='BrowserComment'){
    if(input.verified_resolution===true)throw Error('Verified resolution requires the assigned ADI run and trusted evidence.');
    const body=input.body===undefined?undefined:String(input.body),threadId=input.thread_id===undefined?undefined:String(input.thread_id);
    if(input.resolved!==undefined&&typeof input.resolved!=='boolean')throw Error('resolved must be a boolean.');
    if(input.resolved!==undefined&&!threadId)throw Error('Resolving a comment requires thread_id.');
    let comments=commentServices.get(services);
    if(!comments){
      comments=createReviewCommentService(repository,async (...args)=>{await services.syncWorkItem?.(...args);});
      commentServices.set(services,comments);
    }
    const mutationId=typeof input.client_mutation_id==='string'?input.client_mutation_id:reviewId();
    if(threadId){
      if(input.expected_revision_id!==undefined&&!preview.threads.some(thread=>thread.id===threadId&&thread.revisionId===revision.id))throw Error('This thread belongs to a different revision.');
      if(body===undefined&&input.resolved===undefined)throw Error('Supply a reply body or resolved status.');
      const current=preview.threads.find(thread=>thread.id===threadId);
      if(!current)throw Error('Comment thread was not found.');
      if(input.client_mutation_id!==undefined&&typeof input.expected_generation!=='number')throw Error('Include expected_generation with a retryable comment update.');
      const expectedGeneration=typeof input.expected_generation==='number'?input.expected_generation:current.generation??0;
      const change={previewId:preview.id,threadId,clientMutationId:mutationId,expectedGeneration};
      const result=body===undefined?await comments.setStatus(scope,{...change,resolved:input.resolved as boolean})
        :typeof input.resolved==='boolean'?await comments.replyAndSetStatus(scope,{...change,resolved:input.resolved,body,author:context.author,role:context.role})
        :await comments.reply(scope,{...change,body,author:context.author,role:context.role});
      const saved=previewById(repository.snapshot(scope).state,preview.id);
      return text({previewId:preview.id,thread:saved.threads.find(thread=>thread.id===threadId),...result});
    }
    if(!body?.trim())throw Error('Comment body is required.');
    let anchor;
    if(input.selector){const capture=await request('inspect',{selector:String(input.selector)});if(!capture.selection)throw Error('The component could not be measured.');const rect=capture.selection.rect;anchor=createReviewAnchor({point:{x:rect.x+rect.width/2,y:rect.y+rect.height/2},capture,component:capture.selection,revisionId:revision.id,kind:'live'});}
    else {if(typeof input.x!=='number'||typeof input.y!=='number')throw Error('A comment requires a component selector or document x and y coordinates.');anchor={x:input.x,y:input.y,viewport:preview.viewport};}
    const result=await comments.post(scope,{previewId:preview.id,revisionId:revision.id,clientMutationId:mutationId,body,author:context.author,role:context.role,anchor});
    return text({previewId:preview.id,anchor,...result});
  }
  throw Error(`Unknown review tool: ${name}`);
}
