import * as React from 'react';
import { ArrowLeft, ArrowRight, Check, Code2, Download, Eye, History, Image, LayoutGrid, Layers, Loader2, MessageSquare, MessageSquarePlus, Minus, MousePointer2, Play, Plus, RotateCw, Save, Scan, X } from 'lucide-react';
import { reviewRepository } from '@/lib/review-persistence';
import { activeRevision, revisePreview, reviewId, reviewScopeKey, selectPreview, setReviewViewport, validateViewport, type ReviewAnchor, type ReviewPreview, type ReviewScope, type Viewport } from '@/lib/review-store';
import { browserPreviewKey, publishReviewCapture, requestReviewBrowser, requestReviewLiveFrame, reviewCapture, stopReviewLiveFrames, subscribeReviewCaptures, type BrowserCapture, type BrowserLiveFrame, type BrowserRequest } from '@/lib/review-browser';
import { capturedComponentAt, createReviewAnchor, documentPointToCanvas, resolveReviewAnchor, viewportPointToDocument, type Point, type ReviewAnchorV2 } from '@/lib/review-anchors';
import type { ReviewReference } from '@/lib/review-feedback';
import { executeReviewTool } from '@/lib/review-tools';
import { CommentComposer, ReviewThreadCard } from './review-comments';
import { ReviewBrowserEvidencePanel } from './review-browser-evidence-panel';
import { useReviewComments } from './review-state';
import { useSettings } from './settings/settings-context';

const presets=[{label:'Responsive',width:920,height:720},{label:'Mobile · 393 × 852',width:393,height:852},{label:'Tablet · 768 × 1024',width:768,height:1024},{label:'Desktop · 1440 × 900',width:1440,height:900}];
function download(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function BrowserPreviewImage({capture,title,liveKey,refresh}:{capture:BrowserCapture;title:string;liveKey?:string;refresh:()=>void}) {
  const [frame,setFrame]=React.useState<(BrowserLiveFrame&{key:string})>();
  React.useEffect(()=>{
    if(!liveKey){setFrame(undefined);return;}
    let liveId:string|undefined,timer:ReturnType<typeof setTimeout>|undefined,emptyPolls=0;
    const poll=async(id:string)=>{
      let delay=80;
      try{
        const sample=await requestReviewLiveFrame(liveKey,id);
        if(liveId!==id)return;
        if(sample.screenshot){emptyPolls=0;setFrame({...sample,key:liveKey});}
        else if(++emptyPolls>=3)delay=200;
      }catch{
        if(liveId!==id)return;
        // Retain the browser capture path if the worker restarts or cannot provide live frames.
        setFrame(undefined);refresh();delay=1000;
      }
      timer=setTimeout(()=>{void poll(id);},delay);
    };
    const stop=()=>{
      clearTimeout(timer);
      const id=liveId;liveId=undefined;
      if(id)void stopReviewLiveFrames(liveKey,id).catch(()=>{});
    };
    const syncVisibility=()=>{
      if(document.visibilityState==='hidden'){stop();setFrame(undefined);return;}
      if(liveId)return;
      liveId=reviewId();emptyPolls=0;
      void poll(liveId);
    };
    syncVisibility();
    document.addEventListener('visibilitychange',syncVisibility);
    return()=>{stop();document.removeEventListener('visibilitychange',syncVisibility);};
  },[liveKey,refresh]);
  const current=liveKey&&frame?.key===liveKey&&frame.viewport.width===capture.viewport.width&&frame.viewport.height===capture.viewport.height&&frame.receivedAt>=(capture.evidence?.capturedAt??0);
  return <img src={current?frame.screenshot:capture.screenshot} alt={`Rendered browser preview of ${title}`} draggable={false}/>;
}

export function ReviewBrowserCanvas({scope,preview,onComments,onHandoff}:{scope:ReviewScope;preview:ReviewPreview;onComments:()=>void;onHandoff?:(reference:ReviewReference,target:'composer'|'task')=>Promise<void>}) {
  const revision=activeRevision(preview),key=browserPreviewKey(reviewScopeKey(scope),preview.id,revision.id),settings=useSettings(),comments=useReviewComments(scope,preview.id,preview.revisionId);
  const observed=React.useSyncExternalStore(subscribeReviewCaptures,()=>reviewCapture(key),()=>reviewCapture(key));
  const [saved,setSaved]=React.useState(()=>revision.id!==preview.revisions.at(-1)?.id),[mode,setMode]=React.useState<'inspect'|'prototype'>('inspect'),[tool,setTool]=React.useState<'inspect'|'annotate'>('inspect');
  const [zoom,setZoom]=React.useState<number|'fit'>('fit'),[guides,setGuides]=React.useState(false),[overlays,setOverlays]=React.useState(true),[componentsOpen,setComponentsOpen]=React.useState(false),[evidenceOpen,setEvidenceOpen]=React.useState(false);
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[address,setAddress]=React.useState(revision.url??'Saved HTML artifact'),[viewport,setViewport]=React.useState(preview.viewport);
  const [draft,setDraft]=React.useState<ReviewAnchor|null>(null),[openThread,setOpenThread]=React.useState<string|null>(null),[available,setAvailable]=React.useState(800);
  const stage=React.useRef<HTMLDivElement>(null),canvas=React.useRef<HTMLDivElement>(null),alive=React.useRef(true),pending=React.useRef(0),queue=React.useRef<Promise<unknown>>(Promise.resolve()),selected=React.useRef<string|undefined>(undefined);
  const draftBubble=React.useRef<HTMLDivElement>(null);
  const fallback:BrowserCapture|undefined=revision.observation&&revision.capture?{...revision.observation,screenshot:revision.capture,source:revision.source}:undefined;
  const capture=saved?fallback:observed??fallback;
  const [savedSelection,setSavedSelection]=React.useState<string>();
  const annotationGeneration=React.useRef(0);
  const returnFocus=React.useRef<HTMLElement|null>(null);
  const pointerStart=React.useRef<Point>(undefined),dragClick=React.useRef(false),lastHover=React.useRef(0);
  const [previewKeys,setPreviewKeys]=React.useState(false);
  const closeDraft=()=>{annotationGeneration.current++;setDraft(null);returnFocus.current?.focus({preventScroll:true});};
  const selectMode=(next:'inspect'|'prototype',nextTool:'inspect'|'annotate'=tool)=>{
    closeDraft();setMode(next);setTool(nextTool);setOpenThread(null);
  };
  const showSaved=(next:boolean)=>{selectMode('inspect');setSaved(next);};
  const beginDraft=(result:BrowserCapture,point:Point,component?:BrowserCapture['selection'])=>{
    setOpenThread(null);
    setDraft(createReviewAnchor({point,capture:result,component,revisionId:revision.id,kind:saved?'saved':'live'}));
  };
  const size=capture?.viewport??preview.viewport,scale=zoom==='fit'?Math.max(.08,Math.min(1,(available-72)/size.width)):zoom;
  const threads=preview.threads.filter(t=>t.revisionId===revision.id&&!t.resolved&&!t.anchor.evidenceId),thread=preview.threads.find(t=>t.id===openThread);
  const anchors=threads.flatMap(t=>t.anchor.selector?[t.anchor.selector]:[]);
  const latest=React.useRef({preview,revision,anchors});latest.current={preview,revision,anchors};
  const run=React.useCallback((action:BrowserRequest['action'],extra:Partial<BrowserRequest>={},quiet=false):Promise<BrowserCapture|undefined>=>{
    const work=queue.current.catch(()=>{}).then(async()=>{
      if(!alive.current)return;
      if(action!=='capture'&&action!=='inspect')annotationGeneration.current++;
      pending.current++;if(!quiet)setBusy(true);
      try{
        const data=latest.current;
        const request:BrowserRequest={key,action,anchors:data.anchors,...extra};
        if(!request.selector&&!request.point&&action!=='open')request.selector=selected.current;
        let result:BrowserCapture;
        try{result=await requestReviewBrowser(request);}catch(error){
          if(String(error).includes('Open a preview')){
            await requestReviewBrowser({key,action:'open',url:data.revision.url,html:data.preview.kind==='html'?data.revision.html:undefined,viewport:data.preview.viewport});
            result=await requestReviewBrowser(request);
          }else if(String(error).includes('Component not found')&&action!=='inspect'){
            // The action already ran. Recover its observation without replaying input/history.
            selected.current=undefined;result=await requestReviewBrowser({key,action:'capture',anchors:data.anchors});
          }else throw error;
        }
        selected.current=result.selection?.selector;
        publishReviewCapture(key,result);if(alive.current){setError('');setViewport(result.viewport);}return result;
      }catch(error){if(alive.current&&!quiet)setError(String(error));if(!quiet)throw error;}
      finally{pending.current--;if(alive.current&&!quiet)setBusy(false);}
    });queue.current=work;return work;
  },[key]);
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  React.useEffect(()=>{
    if(saved)return;
    if(document.visibilityState!=='hidden')void run('capture').catch(()=>{});
    if(mode==='prototype')return;
    const timer=setInterval(()=>{if(!pending.current&&document.visibilityState!=='hidden')void run('capture',{},true);},2500);
    return()=>clearInterval(timer);
  },[run,saved,mode]);
  const refreshPrototype=React.useCallback(()=>{if(!pending.current)void run('capture',{},true);},[run]);
  React.useEffect(()=>{const element=stage.current;if(!element)return;const observer=new ResizeObserver(()=>setAvailable(element.clientWidth));observer.observe(element);setAvailable(element.clientWidth);return()=>observer.disconnect();},[]);
  React.useEffect(()=>{if(capture?.url&&capture.url!=='about:blank')setAddress(capture.url);},[capture?.url]);
  React.useEffect(()=>{
    const element=canvas.current;if(!element||saved||draft||openThread)return;
    let timer:ReturnType<typeof setTimeout>|undefined,deltaX=0,deltaY=0,x=0,y=0;
    const wheel=(event:WheelEvent)=>{if((event.target as Element).closest('button, .review-floating-comment'))return;annotationGeneration.current++;event.preventDefault();const rect=element.getBoundingClientRect();x=(event.clientX-rect.left)/scale;y=(event.clientY-rect.top)/scale;deltaX+=event.deltaX;deltaY+=event.deltaY;if(timer)return;timer=setTimeout(()=>{const input={type:'scroll' as const,deltaX,deltaY,x,y};deltaX=0;deltaY=0;timer=undefined;void run('input',{input}).catch(()=>{});},90);};
    element.addEventListener('wheel',wheel,{passive:false});return()=>{element.removeEventListener('wheel',wheel);if(timer)clearTimeout(timer);};
  },[run,saved,capture?.screenshot!==undefined,scale,draft,openThread]);
  const resize=async(value:Viewport)=>{try{validateViewport(value);await run('viewport',{viewport:value});await reviewRepository.change(scope,state=>setReviewViewport(state,preview.id,value));}catch(error){setError(String(error));}};
  const pointFor=(event:React.MouseEvent)=>{const rect=event.currentTarget.getBoundingClientRect();return {x:(event.clientX-rect.left)/scale,y:(event.clientY-rect.top)/scale};};
  const click=async(event:React.MouseEvent)=>{
    if(!capture||draft)return;
    if(dragClick.current){dragClick.current=false;return;}
    const point=pointFor(event);
    returnFocus.current=canvas.current;
    canvas.current?.focus({preventScroll:true});
    const generation=++annotationGeneration.current;
    if(saved){
      const documentPoint={x:point.x+capture.document.scrollX,y:point.y+capture.document.scrollY};
      const component=capturedComponentAt(capture,documentPoint);
      setSavedSelection(component?.selector);
      if(tool==='annotate')beginDraft(capture,documentPoint,component);
      return;
    }
    try{
      if(mode==='prototype'){setPreviewKeys(true);await run('input',{input:{type:'click',...point}});return;}
      const result=await run('inspect',{point});
      if(tool==='annotate'&&result&&alive.current&&generation===annotationGeneration.current){
        if(result.url!==capture.url)return;
        beginDraft(result,{x:point.x+result.document.scrollX,y:point.y+result.document.scrollY},result.selection);
      }
    }catch{ /* run reports the error in the browser chrome */ }
  };
  const saveRevision=async()=>{
    try{const result=await run('save');if(!result)return;const {screenshot,source,...observation}=result;
      await reviewRepository.change(scope,state=>revisePreview(state,preview.id,{url:result.url==='about:blank'?revision.url:result.url,html:preview.kind==='html'?source:undefined,source,capture:screenshot,observation},reviewId()));
    }catch(error){setError(String(error));}
  };
  const navigate=async()=>{setError('');try{await executeReviewTool('BrowserPreview',{url:address,preview_id:preview.id,title:preview.title},{scope,author:settings.account.name||'You',role:'Reviewer'});}catch(error){setError(String(error));}};
  const evidenceTool=async(name:string,input:Record<string,unknown>)=>{
    const context={scope,author:settings.account.name||'You',role:'Reviewer'};
    const output=await executeReviewTool(name,{preview_id:preview.id,...input},context);
    return JSON.parse(output.text).evidenceId as string;
  };
  const prototype=mode==='prototype'&&!saved;
  const pointerDown=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!prototype||!event.isPrimary||event.button!==0)return;
    dragClick.current=false;pointerStart.current=pointFor(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!prototype||event.pointerType==='touch'||pointerStart.current||pending.current||performance.now()-lastHover.current<110)return;
    lastHover.current=performance.now();
    void run('input',{input:{type:'hover',...pointFor(event)}},true);
  };
  const pointerUp=(event:React.PointerEvent<HTMLDivElement>)=>{
    const start=pointerStart.current;pointerStart.current=undefined;
    if(!prototype||!start||!event.isPrimary)return;
    const to=pointFor(event);
    if(Math.hypot(to.x-start.x,to.y-start.y)*scale<4)return;
    dragClick.current=true;
    if(to.x<0||to.y<0||to.x>=size.width||to.y>=size.height)return;
    event.currentTarget.focus({preventScroll:true});setPreviewKeys(true);
    void run('input',{input:{type:'drag',...start,to}}).catch(()=>{});
  };
  const position=(anchor:ReviewAnchor)=>{
    const current=anchor.version===2?anchor as ReviewAnchorV2:undefined;
    const resolution=current&&capture?resolveReviewAnchor(current,capture,revision.id):undefined;
    const rect=resolution?.status==='exact'?resolution.rect:!current&&anchor.selector?capture?.anchors[anchor.selector]:undefined;
    const x=rect?rect.x+rect.width*(current?.normalizedPoint?.x??0.5):anchor.percent?anchor.x/100*size.width:anchor.x;
    const y=rect?rect.y+rect.height*(current?.normalizedPoint?.y??0.5):anchor.percent?anchor.y/100*(capture?.document.height??size.height):anchor.y;
    const point=documentPointToCanvas({x,y},{scale,scrollX:capture?.document.scrollX??0,scrollY:capture?.document.scrollY??0,canvasOffset:{x:0,y:0}});
    return {left:point.x,top:point.y};
  };
  const selection=saved&&savedSelection?capture?.components.find(component=>component.selector===savedSelection):capture?.selection;
  const commentOnSelection=(trigger:HTMLElement)=>{
    if(!capture||draft)return;
    returnFocus.current=trigger;
    const rect=selection?.rect;
    const point=rect?{x:rect.x+rect.width/2,y:rect.y+rect.height/2}:viewportPointToDocument(
      {x:size.width/2,y:size.height/2},
      {scale:1,scrollX:capture.document.scrollX,scrollY:capture.document.scrollY,canvasOffset:{x:0,y:0}},
    );
    beginDraft(capture,point,selection);
  };
  const selectionPosition=selection?{left:(selection.rect.x-(capture?.document.scrollX??0))*scale,top:(selection.rect.y-(capture?.document.scrollY??0))*scale,width:selection.rect.width*scale,height:selection.rect.height*scale}:undefined;
  const draftPosition=draft?position(draft):null;
  const draftLeft=draftPosition?.left,draftTop=draftPosition?.top;
  React.useLayoutEffect(()=>{
    const bubble=draftBubble.current,viewport=canvas.current,scroller=stage.current;
    if(!bubble||!viewport||!scroller||draftLeft===undefined||draftTop===undefined)return;
    const place=()=>{
      const bounds=scroller.getBoundingClientRect(),frame=viewport.getBoundingClientRect();
      const x=frame.left-bounds.left+draftLeft,y=frame.top-bounds.top+draftTop;
      bubble.style.maxWidth=`${Math.max(0,scroller.clientWidth-16)}px`;
      const width=bubble.offsetWidth,height=bubble.offsetHeight;
      const clamp=(value:number,limit:number)=>Math.max(8,Math.min(value,limit-8));
      bubble.style.left=`${clamp(x+12,scroller.clientWidth-width)}px`;
      bubble.style.top=`${clamp(y+12+height<=scroller.clientHeight?y+12:y-height-12,scroller.clientHeight-height)}px`;
    };
    place();
    const observer=new ResizeObserver(place);
    observer.observe(bubble);observer.observe(scroller);observer.observe(viewport);
    scroller.addEventListener('scroll',place,{passive:true});
    return()=>{observer.disconnect();scroller.removeEventListener('scroll',place);};
  },[draftLeft,draftTop,componentsOpen,scale]);
  const zoomSteps=[.25,.5,.75,1,1.25,1.5,2];
  return <div className="review-workbench">
    <div className="review-toolbar">
      <div className="review-tool-group"><button type="button" aria-label="Select component" aria-pressed={tool==='inspect'} onClick={()=>selectMode('inspect','inspect')}><MousePointer2/></button><button type="button" aria-label="Annotate component" title="Annotate component" aria-pressed={tool==='annotate'} onClick={()=>selectMode('inspect','annotate')}><MessageSquarePlus/></button><button type="button" aria-label="Toggle column guides" aria-pressed={guides} onClick={()=>setGuides(value=>!value)}><LayoutGrid/></button><button type="button" aria-label="Toggle selection overlays" aria-pressed={overlays} onClick={()=>setOverlays(value=>!value)}><Eye/></button></div>
      <button type="button" aria-label="Zoom out" onClick={()=>setZoom(zoomSteps.filter(v=>v<(zoom==='fit'?scale:zoom)).at(-1)??.25)}><Minus/></button><span className="tabular-nums text-[11px] text-muted-foreground">{zoom==='fit'?'Fit':`${Math.round(zoom*100)}%`}</span><button type="button" aria-label="Zoom in" onClick={()=>setZoom(zoomSteps.find(v=>v>(zoom==='fit'?scale:zoom))??2)}><Plus/></button>
      <button type="button" aria-label="Inspect component list" aria-pressed={componentsOpen} onClick={()=>{setEvidenceOpen(false);setComponentsOpen(value=>!value);}}><Layers/><span className="review-tool-label">Components</span></button><button type="button" aria-label="Browser evidence" aria-pressed={evidenceOpen} onClick={()=>{setComponentsOpen(false);setEvidenceOpen(value=>!value);}}><Image/><span className="review-tool-label">Evidence</span></button><button type="button" aria-label="Review comments" onClick={onComments}><MessageSquare/><span>{preview.threads.filter(t=>t.revisionId===revision.id&&!t.resolved).length}</span></button>
      <div className="review-tool-group review-mode-group"><button type="button" aria-pressed={mode==='inspect'} onClick={()=>selectMode('inspect')}><Scan/>Inspect</button><button type="button" aria-pressed={mode==='prototype'} disabled={saved} onClick={()=>selectMode('prototype')}><Play/>Prototype</button></div>
    </div>
    <div className="review-toolbar">
      <button type="button" aria-label="Back" title="Back" disabled={saved||busy} onClick={()=>{void run('back').catch(()=>{});}}><ArrowLeft/></button><button type="button" aria-label="Forward" title="Forward" disabled={saved||busy} onClick={()=>{void run('forward').catch(()=>{});}}><ArrowRight/></button><button type="button" aria-label="Reload preview" disabled={saved||busy} onClick={()=>{void run('reload').catch(()=>{});}}><RotateCw className={busy?'animate-spin':''}/></button>
      <form className="review-address" onSubmit={event=>{event.preventDefault();void navigate();}}><input aria-label="Browser address" value={address} onChange={event=>setAddress(event.target.value)} readOnly={preview.kind==='html'} spellCheck={false}/></form>
      <div className="review-dimensions"><select aria-label="Device preset" value={presets.findIndex(p=>p.width===viewport.width&&p.height===viewport.height)} disabled={saved} onChange={event=>{const preset=presets[Number(event.target.value)];if(preset){const value={width:preset.width,height:preset.height};setViewport(value);void resize(value);}}}><option value={-1}>Custom</option>{presets.map((preset,index)=><option key={preset.label} value={index}>{preset.label}</option>)}</select>
        <input type="number" aria-label="Viewport width" min={100} max={4096} value={viewport.width} disabled={saved} onChange={event=>setViewport(value=>({...value,width:Number(event.target.value)}))} onBlur={()=>{if(viewport.width!==size.width)void resize(viewport);}} onKeyDown={event=>{if(event.key==='Enter')void resize(viewport);}}/><span>×</span><input type="number" aria-label="Viewport height" min={100} max={4096} value={viewport.height} disabled={saved} onChange={event=>setViewport(value=>({...value,height:Number(event.target.value)}))} onBlur={()=>{if(viewport.height!==size.height)void resize(viewport);}} onKeyDown={event=>{if(event.key==='Enter')void resize(viewport);}}/>
      </div>
      <select aria-label="Preview zoom" value={zoom} onChange={event=>setZoom(event.target.value==='fit'?'fit':Number(event.target.value))}><option value="fit">Fit to window</option>{zoomSteps.map(value=><option key={value} value={value}>{value*100}%</option>)}</select>
    </div>
    <div className="review-meta"><Code2 className="size-3.5 shrink-0"/><span>{preview.title}</span><span className="review-status">{saved?'Saved capture':'Live browser'}</span><select aria-label="Artifact revision" value={preview.revisionId} className="min-w-0 max-w-36 bg-transparent text-[10px]" onChange={event=>{const revisionId=event.target.value;void reviewRepository.change(scope,state=>selectPreview(state,preview.id,revisionId)).catch(error=>setError(String(error)));}}>{preview.revisions.map((r,i)=><option key={r.id} value={r.id} className="bg-card">Revision {i+1} · {new Date(r.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</option>)}</select><span className="review-meta-right">{capture?.components.length??0}{capture?.componentsTruncated?'+':''} components · {Math.round(scale*100)}%</span></div>
    {error&&<div role="alert" className="review-error">{error}<button type="button" onClick={()=>{void run('capture').catch(()=>{});}}>Retry</button></div>}
    {saved&&<div className="review-saved-notice"><History className="size-3.5"/>{revision.id===preview.revisions.at(-1)?.id?'Preserved capture':'Historical revision'}. Comments stay attached to this revision.{revision.id===preview.revisions.at(-1)?.id&&<button type="button" onClick={()=>showSaved(false)}>Resume live preview</button>}</div>}
    <div className="review-body">
      <div ref={stage} className="review-stage" data-grid={settings.appearance.canvasGrid}>
        {capture?<div ref={canvas} className="review-viewport" data-tool={mode==='prototype'?'prototype':tool} style={{width:size.width*scale,height:size.height*scale}} tabIndex={0} aria-label="Browser preview viewport" role="application" onClick={click}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{pointerStart.current=undefined;dragClick.current=false;}}
          onPointerLeave={()=>{if(prototype&&!pointerStart.current)void run('input',{input:{type:'hover',leave:true}},true);}} onBlur={()=>setPreviewKeys(false)} onKeyDown={event=>{
          if(event.target!==event.currentTarget)return;
          if(mode==='inspect'&&tool==='annotate'&&(event.key==='Enter'||event.key===' ')){
            event.preventDefault();commentOnSelection(event.currentTarget);return;
          }
          if(!prototype||event.ctrlKey||event.metaKey||event.altKey||event.nativeEvent.isComposing)return;
          if(event.key==='Tab'&&!previewKeys)return;
          if(event.key==='Escape')setPreviewKeys(false);
          if(event.key==='Enter'&&!previewKeys)setPreviewKeys(true);
          event.preventDefault();
          const input=event.key.length===1&&event.key!==' '?{type:'text' as const,text:event.key}:{type:'key' as const,key:event.key,shift:event.shiftKey};void run('input',{input}).catch(()=>{});
        }} onPaste={event=>{if(event.target===event.currentTarget&&mode==='prototype'&&!saved){event.preventDefault();void run('input',{input:{type:'text',text:event.clipboardData.getData('text/plain')}}).catch(()=>{});}}}>
          <BrowserPreviewImage capture={capture} title={preview.title} liveKey={prototype?key:undefined} refresh={refreshPrototype}/>
          {mode==='inspect'&&guides&&<div className="review-guides">{Array.from({length:12},(_,i)=><i key={i}/>)}</div>}
          {mode==='inspect'&&overlays&&selectionPosition&&<div className="review-selection" style={selectionPosition}><span className="review-measure">{selection!.tag} · {Math.round(selection!.rect.width)} × {Math.round(selection!.rect.height)}</span></div>}
          {mode==='inspect'&&overlays&&threads.map((item,index)=>{const pos=position(item.anchor);if(pos.left<0||pos.top<0||pos.left>size.width*scale||pos.top>size.height*scale)return null;return <button type="button" key={item.id} className="review-pin" aria-label={`Comment ${index+1} by ${item.messages[0].author}`} aria-pressed={openThread===item.id} style={pos} onClick={event=>{event.stopPropagation();setDraft(null);setOpenThread(value=>value===item.id?null:item.id);}}>{index+1}</button>;})}
          {mode==='inspect'&&thread&&!thread.resolved&&thread.revisionId===revision.id&&<div className="review-floating-comment" style={{left:Math.max(8,Math.min(position(thread.anchor).left+18,size.width*scale-300)),top:Math.max(8,Math.min(position(thread.anchor).top,size.height*scale-260))}} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}><ReviewThreadCard thread={thread} onClose={()=>setOpenThread(null)} onReply={body=>comments.reply(thread.id,body)} onResolve={resolved=>comments.resolve(thread.id,resolved)} onHandoff={onHandoff?target=>onHandoff({scope,previewId:preview.id,revisionId:thread.revisionId,threadIds:[thread.id]},target):undefined} canOpenTask={!!scope.workspace}/></div>}
          {busy&&<div className="review-loading"><Loader2/></div>}
        </div>:<div className="review-empty">{busy?<Loader2 className="animate-spin"/>:<Scan/>}<h2>{busy?'Opening browser…':'Preview is ready to open'}</h2><p>{busy?'Rendering the page and measuring its components.':'Your artifact is saved. Retry the browser connection to continue reviewing.'}</p>{!busy&&<button type="button" className="review-primary" onClick={()=>{void run('capture').catch(()=>{});}}>Connect browser</button>}</div>}
      </div>
      {draft&&<div ref={draftBubble} className="review-comment-bubble" role="group" aria-label="New comment"><CommentComposer compact autoFocus onCancel={closeDraft} onSubmit={async body=>{await comments.add(body,draft);closeDraft();}}/></div>}
      {componentsOpen&&<aside className="review-side-panel" aria-label="Measured components"><header><strong>Components</strong><button type="button" aria-label="Close components" onClick={()=>setComponentsOpen(false)}><X/></button></header><div className="review-component-list">{capture?.components.map((component,index)=><button type="button" key={`${component.selector}:${index}`} aria-pressed={selection?.selector===component.selector} onClick={()=>{if(saved)setSavedSelection(component.selector);else void run('inspect',{selector:component.selector}).catch(()=>{});}}><code>{component.tag}</code><span>{component.text||component.selector}</span></button>)}</div>
        {selection&&<div className="review-component-details"><h3>Selected component</h3><code>{selection.selector}</code><dl><dt>Dimensions</dt><dd>{Math.round(selection.rect.width)} × {Math.round(selection.rect.height)} px</dd><dt>Position</dt><dd>{Math.round(selection.rect.x)}, {Math.round(selection.rect.y)}</dd>{Object.entries(selection.styles).map(([property,value])=><React.Fragment key={property}><dt>{property}</dt><dd>{value}</dd></React.Fragment>)}</dl><button type="button" className="review-primary" onClick={event=>{commentOnSelection(event.currentTarget);returnFocus.current=canvas.current;setComponentsOpen(false);}}><MessageSquarePlus className="size-3.5"/>Comment on component</button></div>}
      </aside>}
      {evidenceOpen&&<ReviewBrowserEvidencePanel preview={preview} viewport={size} selectedSelector={selection?.selector} diagnostics={capture?.diagnostics}
        live={!saved&&revision.id===preview.revisions.at(-1)?.id} onClose={()=>setEvidenceOpen(false)}
        onCapture={(mode,selector)=>evidenceTool('BrowserCapture',{mode,selector,expected_revision_id:revision.id})}
        onReplay={run_id=>evidenceTool('BrowserReplay',{run_id,width:size.width,height:size.height,expected_revision_id:revision.id})}
        onComment={async(evidence_id,frame_index,x,y,body)=>{await evidenceTool('BrowserComment',{evidence_id,frame_index,x,y,body});}}/>}
    </div>
    <div className="review-footer">{selection?<><code>{selection.tag}</code><span>{Math.round(selection.rect.width)} × {Math.round(selection.rect.height)} px</span><span>{selection.styles.fontSize} · {selection.styles.fontWeight}</span></>:<span>{size.width} × {size.height} CSS pixels · {mode==='prototype'?(previewKeys?'Esc releases keyboard focus':'Click, drag, type or scroll to interact'):'Click to inspect a component'}</span>}
      <button type="button" title="Download preserved HTML" aria-label="Download artifact HTML" disabled={!revision.html&&!revision.source} onClick={()=>download(`${preview.title.replace(/[^a-z0-9_-]/gi,'-')}.html`,revision.html??revision.source??'','text/html;charset=utf-8')}><Download className="size-3.5"/></button>
      <button type="button" aria-label="View saved capture" title="View the preserved capture" disabled={!revision.capture} onClick={()=>showSaved(!saved)}><Check className="size-3.5"/></button><button type="button" aria-label="Save artifact revision" disabled={busy||saved} onClick={()=>{void saveRevision();}} className="flex items-center gap-1.5"><Save className="size-3.5"/>Save revision</button>
    </div>
  </div>;
}
