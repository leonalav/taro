import * as React from 'react';
import { ArrowLeft, ArrowRight, Check, Code2, Download, Eye, History, LayoutGrid, Layers, Loader2, MessageSquare, MessageSquarePlus, Minus, MousePointer2, Play, Plus, RotateCw, Save, Scan, X } from 'lucide-react';
import { reviewRepository } from '@/lib/review-persistence';
import { activeRevision, revisePreview, reviewId, reviewScopeKey, selectPreview, setReviewViewport, validateViewport, type ReviewAnchor, type ReviewPreview, type ReviewScope, type Viewport } from '@/lib/review-store';
import { browserPreviewKey, publishReviewCapture, requestReviewBrowser, reviewCapture, subscribeReviewCaptures, type BrowserCapture, type BrowserRequest } from '@/lib/review-browser';
import { executeReviewTool } from '@/lib/review-tools';
import { CommentComposer, ReviewThreadCard } from './review-comments';
import { useReviewComments } from './review-state';
import { useSettings } from './settings/settings-context';

const presets=[{label:'Responsive',width:920,height:720},{label:'Mobile · 393 × 852',width:393,height:852},{label:'Tablet · 768 × 1024',width:768,height:1024},{label:'Desktop · 1440 × 900',width:1440,height:900}];
function download(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function ReviewBrowserCanvas({scope,preview,onComments}:{scope:ReviewScope;preview:ReviewPreview;onComments:()=>void}) {
  const revision=activeRevision(preview),key=browserPreviewKey(reviewScopeKey(scope),preview.id,revision.id),settings=useSettings(),comments=useReviewComments(scope,preview.id,preview.revisionId);
  const observed=React.useSyncExternalStore(subscribeReviewCaptures,()=>reviewCapture(key),()=>reviewCapture(key));
  const [saved,setSaved]=React.useState(()=>revision.id!==preview.revisions.at(-1)?.id),[mode,setMode]=React.useState<'inspect'|'prototype'>('inspect'),[tool,setTool]=React.useState<'inspect'|'annotate'>('inspect');
  const [zoom,setZoom]=React.useState<number|'fit'>('fit'),[guides,setGuides]=React.useState(false),[overlays,setOverlays]=React.useState(true),[componentsOpen,setComponentsOpen]=React.useState(false);
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[address,setAddress]=React.useState(revision.url??'Saved HTML artifact'),[viewport,setViewport]=React.useState(preview.viewport);
  const [draft,setDraft]=React.useState<ReviewAnchor|null>(null),[openThread,setOpenThread]=React.useState<string|null>(null),[available,setAvailable]=React.useState(800);
  const stage=React.useRef<HTMLDivElement>(null),canvas=React.useRef<HTMLDivElement>(null),alive=React.useRef(true),pending=React.useRef(0),queue=React.useRef<Promise<unknown>>(Promise.resolve()),selected=React.useRef<string|undefined>(undefined);
  const fallback:BrowserCapture|undefined=revision.observation&&revision.capture?{...revision.observation,screenshot:revision.capture,source:revision.source}:undefined;
  const capture=saved?fallback:observed??fallback;
  const size=capture?.viewport??preview.viewport,scale=zoom==='fit'?Math.max(.08,Math.min(1,(available-72)/size.width)):zoom;
  const threads=preview.threads.filter(t=>t.revisionId===revision.id&&!t.resolved),thread=preview.threads.find(t=>t.id===openThread);
  const anchors=threads.flatMap(t=>t.anchor.selector?[t.anchor.selector]:[]);
  const latest=React.useRef({preview,revision,anchors});latest.current={preview,revision,anchors};
  const run=React.useCallback((action:BrowserRequest['action'],extra:Partial<BrowserRequest>={},quiet=false):Promise<BrowserCapture|undefined>=>{
    const work=queue.current.catch(()=>{}).then(async()=>{
      if(!alive.current)return;
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
    if(saved)return;void run('capture').catch(()=>{});
    const timer=setInterval(()=>{if(!pending.current&&document.visibilityState!=='hidden')void run('capture',{},true);},mode==='prototype'?1000:2500);
    return()=>clearInterval(timer);
  },[run,saved,mode]);
  React.useEffect(()=>{const element=stage.current;if(!element)return;const observer=new ResizeObserver(()=>setAvailable(element.clientWidth));observer.observe(element);setAvailable(element.clientWidth);return()=>observer.disconnect();},[]);
  React.useEffect(()=>{if(capture?.url&&capture.url!=='about:blank')setAddress(capture.url);},[capture?.url]);
  React.useEffect(()=>{
    const element=canvas.current;if(!element||saved)return;
    let timer:ReturnType<typeof setTimeout>|undefined,deltaX=0,deltaY=0,x=0,y=0;
    const wheel=(event:WheelEvent)=>{event.preventDefault();const rect=element.getBoundingClientRect();x=(event.clientX-rect.left)/scale;y=(event.clientY-rect.top)/scale;deltaX+=event.deltaX;deltaY+=event.deltaY;if(timer)return;timer=setTimeout(()=>{const input={type:'scroll' as const,deltaX,deltaY,x,y};deltaX=0;deltaY=0;timer=undefined;void run('input',{input}).catch(()=>{});},90);};
    element.addEventListener('wheel',wheel,{passive:false});return()=>{element.removeEventListener('wheel',wheel);if(timer)clearTimeout(timer);};
  },[run,saved,capture?.screenshot!==undefined,scale]);
  const resize=async(value:Viewport)=>{try{validateViewport(value);await run('viewport',{viewport:value});await reviewRepository.change(scope,state=>setReviewViewport(state,preview.id,value));}catch(error){setError(String(error));}};
  const pointFor=(event:React.MouseEvent)=>{const rect=event.currentTarget.getBoundingClientRect();return {x:(event.clientX-rect.left)/scale,y:(event.clientY-rect.top)/scale};};
  const click=async(event:React.MouseEvent)=>{
    if(saved)return;const point=pointFor(event);canvas.current?.focus();
    try{
      if(mode==='prototype'){await run('input',{input:{type:'click',...point}});return;}
      const result=await run('inspect',{point});
      if(tool==='annotate'&&result){const component=result.selection,rect=component?.rect;setOpenThread(null);setDraft({x:rect?rect.x+rect.width/2:point.x+result.document.scrollX,y:rect?rect.y+rect.height/2:point.y+result.document.scrollY,selector:component?.selector,viewport:result.viewport});}
    }catch{ /* run reports the error in the browser chrome */ }
  };
  const saveRevision=async()=>{
    try{const result=await run('save');if(!result)return;const {screenshot,source,...observation}=result;
      await reviewRepository.change(scope,state=>revisePreview(state,preview.id,{url:result.url==='about:blank'?revision.url:result.url,html:preview.kind==='html'?source:undefined,source,capture:screenshot,observation},reviewId()));
    }catch(error){setError(String(error));}
  };
  const navigate=async()=>{setError('');try{await executeReviewTool('BrowserPreview',{url:address,preview_id:preview.id,title:preview.title},{scope,author:settings.account.name||'You',role:'Reviewer'});}catch(error){setError(String(error));}};
  const position=(anchor:ReviewAnchor)=>{
    const rect=anchor.selector?capture?.anchors[anchor.selector]:undefined;
    const x=rect?rect.x+rect.width/2:anchor.percent?anchor.x/100*size.width:anchor.x,y=rect?rect.y+rect.height/2:anchor.percent?anchor.y/100*(capture?.document.height??size.height):anchor.y;
    return {left:(x-(capture?.document.scrollX??0))*scale,top:(y-(capture?.document.scrollY??0))*scale};
  };
  const selection=capture?.selection,selectionPosition=selection?{left:(selection.rect.x-(capture?.document.scrollX??0))*scale,top:(selection.rect.y-(capture?.document.scrollY??0))*scale,width:selection.rect.width*scale,height:selection.rect.height*scale}:undefined;
  const zoomSteps=[.25,.5,.75,1,1.25,1.5,2];
  return <div className="review-workbench">
    <div className="review-toolbar">
      <div className="review-tool-group"><button type="button" aria-label="Select component" aria-pressed={tool==='inspect'} onClick={()=>{setMode('inspect');setTool('inspect');}}><MousePointer2/></button><button type="button" aria-label="Annotate component" title="Annotate component" aria-pressed={tool==='annotate'} onClick={()=>{setMode('inspect');setTool('annotate');}}><MessageSquarePlus/></button><button type="button" aria-label="Toggle column guides" aria-pressed={guides} onClick={()=>setGuides(value=>!value)}><LayoutGrid/></button><button type="button" aria-label="Toggle selection overlays" aria-pressed={overlays} onClick={()=>setOverlays(value=>!value)}><Eye/></button></div>
      <button type="button" aria-label="Zoom out" onClick={()=>setZoom(zoomSteps.filter(v=>v<(zoom==='fit'?scale:zoom)).at(-1)??.25)}><Minus/></button><span className="tabular-nums text-[11px] text-muted-foreground">{zoom==='fit'?'Fit':`${Math.round(zoom*100)}%`}</span><button type="button" aria-label="Zoom in" onClick={()=>setZoom(zoomSteps.find(v=>v>(zoom==='fit'?scale:zoom))??2)}><Plus/></button>
      <button type="button" aria-label="Inspect component list" aria-pressed={componentsOpen} onClick={()=>setComponentsOpen(value=>!value)}><Layers/><span className="review-tool-label">Components</span></button><button type="button" aria-label="Review comments" onClick={onComments}><MessageSquare/><span>{threads.length}</span></button>
      <div className="review-tool-group review-mode-group"><button type="button" aria-pressed={mode==='inspect'} onClick={()=>setMode('inspect')}><Scan/>Inspect</button><button type="button" aria-pressed={mode==='prototype'} disabled={saved} onClick={()=>setMode('prototype')}><Play/>Prototype</button></div>
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
    {saved&&<div className="review-saved-notice"><History className="size-3.5"/>Preserved capture. Comments stay attached to this revision.<button type="button" onClick={()=>setSaved(false)}>Resume live preview</button></div>}
    <div className="review-body">
      <div ref={stage} className="review-stage" data-grid={settings.appearance.canvasGrid}>
        {capture?<div ref={canvas} className="review-viewport" data-tool={mode==='prototype'?'prototype':tool} style={{width:size.width*scale,height:size.height*scale}} tabIndex={0} aria-label="Browser preview viewport" role="application" onClick={click} onKeyDown={event=>{
          if(saved||mode!=='prototype')return;event.preventDefault();if(event.ctrlKey||event.metaKey||event.altKey)return;
          const input=event.key.length===1?{type:'text' as const,text:event.key}:{type:'key' as const,key:event.key};void run('input',{input}).catch(()=>{});
        }} onPaste={event=>{if(mode==='prototype'&&!saved){event.preventDefault();void run('input',{input:{type:'text',text:event.clipboardData.getData('text/plain')}}).catch(()=>{});}}}>
          <img src={capture.screenshot} alt={`Rendered browser preview of ${preview.title}`} draggable={false}/>
          {mode==='inspect'&&guides&&<div className="review-guides">{Array.from({length:12},(_,i)=><i key={i}/>)}</div>}
          {mode==='inspect'&&overlays&&selectionPosition&&<div className="review-selection" style={selectionPosition}><span className="review-measure">{selection!.tag} · {Math.round(selection!.rect.width)} × {Math.round(selection!.rect.height)}</span></div>}
          {mode==='inspect'&&overlays&&threads.map((item,index)=>{const pos=position(item.anchor);if(pos.left<0||pos.top<0||pos.left>size.width*scale||pos.top>size.height*scale)return null;return <button type="button" key={item.id} className="review-pin" aria-label={`Comment ${index+1} by ${item.messages[0].author}`} aria-pressed={openThread===item.id} style={pos} onClick={event=>{event.stopPropagation();setDraft(null);setOpenThread(value=>value===item.id?null:item.id);}}>{index+1}</button>;})}
          {mode==='inspect'&&thread&&!thread.resolved&&thread.revisionId===revision.id&&<div className="review-floating-comment" style={{left:Math.max(8,Math.min(position(thread.anchor).left+18,size.width*scale-300)),top:Math.max(8,Math.min(position(thread.anchor).top,size.height*scale-260))}} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}><ReviewThreadCard thread={thread} onClose={()=>setOpenThread(null)} onReply={body=>comments.reply(thread.id,body)} onResolve={resolved=>comments.resolve(thread.id,resolved)}/></div>}
          {draft&&<div className="review-floating-comment" style={{right:12,bottom:12}} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}><div className="review-thread"><strong>New comment</strong>{draft.selector&&<code className="review-anchor-label">{draft.selector}</code>}<CommentComposer onCancel={()=>setDraft(null)} onSubmit={async body=>{await comments.add(body,draft);setDraft(null);}}/></div></div>}
          {busy&&<div className="review-loading"><Loader2/></div>}
        </div>:<div className="review-empty">{busy?<Loader2 className="animate-spin"/>:<Scan/>}<h2>{busy?'Opening browser…':'Preview is ready to open'}</h2><p>{busy?'Rendering the page and measuring its components.':'Your artifact is saved. Retry the browser connection to continue reviewing.'}</p>{!busy&&<button type="button" className="review-primary" onClick={()=>{void run('capture').catch(()=>{});}}>Connect browser</button>}</div>}
      </div>
      {componentsOpen&&<aside className="review-side-panel" aria-label="Measured components"><header><strong>Components</strong><button type="button" aria-label="Close components" onClick={()=>setComponentsOpen(false)}><X/></button></header><div className="review-component-list">{capture?.components.map((component,index)=><button type="button" key={`${component.selector}:${index}`} aria-pressed={selection?.selector===component.selector} onClick={()=>{void run('inspect',{selector:component.selector}).catch(()=>{});}}><code>{component.tag}</code><span>{component.text||component.selector}</span></button>)}</div>
        {selection&&<div className="review-component-details"><h3>Selected component</h3><code>{selection.selector}</code><dl><dt>Dimensions</dt><dd>{Math.round(selection.rect.width)} × {Math.round(selection.rect.height)} px</dd><dt>Position</dt><dd>{Math.round(selection.rect.x)}, {Math.round(selection.rect.y)}</dd>{Object.entries(selection.styles).map(([property,value])=><React.Fragment key={property}><dt>{property}</dt><dd>{value}</dd></React.Fragment>)}</dl><button type="button" className="review-primary" onClick={()=>{setDraft({x:selection.rect.x+selection.rect.width/2,y:selection.rect.y+selection.rect.height/2,selector:selection.selector,viewport:size});setComponentsOpen(false);}}><MessageSquarePlus className="size-3.5"/>Comment on component</button></div>}
      </aside>}
    </div>
    <div className="review-footer">{selection?<><code>{selection.tag}</code><span>{Math.round(selection.rect.width)} × {Math.round(selection.rect.height)} px</span><span>{selection.styles.fontSize} · {selection.styles.fontWeight}</span></>:<span>{size.width} × {size.height} CSS pixels · {mode==='prototype'?'Click, type or scroll to interact':'Click to inspect a component'}</span>}
      <button type="button" title="Download preserved HTML" aria-label="Download artifact HTML" disabled={!revision.html&&!revision.source} onClick={()=>download(`${preview.title.replace(/[^a-z0-9_-]/gi,'-')}.html`,revision.html??revision.source??'','text/html;charset=utf-8')}><Download className="size-3.5"/></button>
      <button type="button" aria-label="View saved capture" title="View the preserved capture" disabled={!revision.capture} onClick={()=>setSaved(value=>!value)}><Check className="size-3.5"/></button><button type="button" aria-label="Save artifact revision" disabled={busy||saved} onClick={()=>{void saveRevision();}} className="flex items-center gap-1.5"><Save className="size-3.5"/>Save revision</button>
    </div>
  </div>;
}
