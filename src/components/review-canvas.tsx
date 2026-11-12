import * as React from 'react';
import { Globe, Layers, Loader2, MessageSquare, Plus, ScanEye, Upload, X } from 'lucide-react';
import { ArtifactAuditPanel } from './artifact-audit-panel';
import { NikeReviewCanvas } from './nike-review-canvas';
import { ReviewBrowserCanvas } from './review-browser-canvas';
import { ReviewThreadCard } from './review-comments';
import { useReviewComments, useReviewState } from './review-state';
import { reviewRepository } from '@/lib/review-persistence';
import { executeReviewTool } from '@/lib/review-tools';
import { selectPreview, type ReviewPreview, type ReviewScope } from '@/lib/review-store';
import { useSettings } from './settings/settings-context';
import './review.css';
export { EmptyReviewCanvas } from './nike-review-canvas';

export function ReviewCanvas({workspaceRoot='',sessionId='brand'}:{workspaceRoot?:string;sessionId?:string}) {
  const scope=React.useMemo(()=>({workspace:workspaceRoot,sessionId}),[workspaceRoot,sessionId]);
  const snapshot=useReviewState(scope),settings=useSettings();
  const [newOpen,setNewOpen]=React.useState(false),[address,setAddress]=React.useState(''),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[threadsOpen,setThreadsOpen]=React.useState(false);
  const [auditOpen,setAuditOpen]=React.useState(false);
  const upload=React.useRef<HTMLInputElement>(null);
  const preview=snapshot.state.previews.find(p=>p.id===snapshot.state.activeId);
  const open=async(input:Record<string,unknown>)=>{
    if(busy)return;setBusy(true);setError('');
    try{await executeReviewTool('BrowserPreview',input,{scope,author:settings.account.name||'You',role:'Reviewer'});setNewOpen(false);setAddress('');}
    catch(error){setError(String(error));}finally{setBusy(false);}
  };
  const form=<form className="review-address" onSubmit={event=>{event.preventDefault();void open({url:address});}}><input aria-label="Preview URL" placeholder="http://localhost:3000" value={address} onChange={event=>setAddress(event.target.value)} type="url" required disabled={busy}/><button type="submit" className="review-primary" disabled={busy||!address.trim()}>{busy?<Loader2 className="size-3.5 animate-spin"/>:<Globe className="size-3.5"/>}{busy?'Opening…':'Open preview'}</button></form>;
  return <section className="review-workbench" aria-label="Review mode">
    <div className="review-tabs" role="tablist" aria-label="Saved previews">
      {snapshot.state.previews.map(item=><button key={item.id} type="button" role="tab" aria-selected={item.id===preview?.id} className="review-tab" onClick={()=>{setNewOpen(false);void reviewRepository.change(scope,state=>selectPreview(state,item.id)).catch(error=>setError(String(error)));}}>{item.kind==='nike'?<Layers/>:<Globe/>}<span>{item.title}</span></button>)}
      <button type="button" className="review-new-tab" aria-label="New browser preview" title="New browser preview" onClick={()=>setNewOpen(value=>!value)}><Plus/></button>
      {preview?.kind!=='nike'&&preview&&<button type="button" aria-label="Show visual checks" title="Visual checks for this revision" aria-pressed={auditOpen} className="review-new-tab" onClick={()=>{setAuditOpen(value=>!value);setThreadsOpen(false);}}><ScanEye/></button>}
      {preview&&<button type="button" aria-label="Show review threads" title="Comments, replies and resolved threads" aria-pressed={threadsOpen} className="review-new-tab" onClick={()=>{setThreadsOpen(value=>!value);setAuditOpen(false);}}><MessageSquare/><span className="sr-only">{preview.threads.filter(t=>!t.resolved).length} open threads</span></button>}
    </div>
    {snapshot.error&&<div role="alert" className="review-error review-storage-error">{snapshot.error}<button type="button" onClick={()=>{void(snapshot.unsaved?reviewRepository.retrySave(scope):reviewRepository.load(scope)).catch(()=>{});}}>Retry saving</button></div>}
    {error&&<div role="alert" className="review-error">{error}<button type="button" onClick={()=>setError('')}>Dismiss</button></div>}
    {newOpen&&preview&&<div className="review-toolbar">{form}<button type="button" onClick={()=>upload.current?.click()} title="Open an HTML artifact" aria-label="Upload HTML artifact"><Upload/></button><button type="button" aria-label="Cancel new preview" onClick={()=>setNewOpen(false)}><X/></button></div>}
    <input ref={upload} type="file" accept=".html,.htm,text/html" className="sr-only" aria-label="HTML artifact file" onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>6*1024*1024){setError('HTML artifacts must be under 6 MiB.');return;}try{await open({html:await file.text(),title:file.name});}catch(error){setError(String(error));}}}/>
    {!snapshot.loaded&&!snapshot.error?<div className="review-empty"><Loader2 className="animate-spin"/><p>Loading saved previews…</p></div>:!preview?<div className="review-empty"><Globe/><h2>Open a browser preview</h2><p>Review a live app or a saved HTML artifact. Inspect components, measure dimensions, and leave comments with your agents.</p>{form}<button type="button" className="review-secondary" disabled={busy} onClick={()=>upload.current?.click()}><Upload className="size-3.5"/>Open HTML artifact</button><p className="text-[11px]">Agents can open this surface with <code>BrowserPreview</code>.</p></div>:
      <div className="review-body">
        {preview.kind==='nike'?<NikeReviewCanvas key={preview.id} scope={scope} preview={preview}/>:<ReviewBrowserCanvas key={`${preview.id}:${preview.revisionId}`} scope={scope} preview={preview} onComments={()=>setThreadsOpen(value=>!value)}/>}
        {threadsOpen&&<ReviewThreadsPanel scope={scope} preview={preview} onClose={()=>setThreadsOpen(false)}/>}
        {auditOpen&&preview.kind!=='nike'&&<ArtifactAuditPanel key={`${preview.id}:${preview.revisionId}`} scope={scope} preview={preview} onClose={()=>setAuditOpen(false)}/>}
      </div>}
  </section>;
}

function ReviewThreadsPanel({scope,preview,onClose}:{scope:ReviewScope;preview:ReviewPreview;onClose:()=>void}){
  const [resolved,setResolved]=React.useState(false),comments=useReviewComments(scope,preview.id);
  const threads=preview.threads.filter(t=>resolved?t.resolved:!t.resolved);
  return <aside className="review-side-panel" aria-label="Review comment threads"><header><strong>Comments <span className="text-muted-foreground">{preview.threads.length}</span></strong><button type="button" aria-label="Close review threads" onClick={onClose}><X/></button></header><div className="review-panel-filter"><button type="button" aria-pressed={!resolved} onClick={()=>setResolved(false)}>Open</button><button type="button" aria-pressed={resolved} onClick={()=>setResolved(true)}>Resolved</button></div>
    {!threads.length&&<p className="text-xs leading-5 text-muted-foreground">{resolved?'No resolved threads. Resolving a comment keeps its full history here.':'No open comments. Choose Annotate and click a component to start a thread.'}</p>}
    {threads.map(thread=><div key={thread.id}>{thread.revisionId!==preview.revisionId&&<button type="button" className="mb-2 text-[10px] text-muted-foreground underline" onClick={()=>{void reviewRepository.change(scope,state=>selectPreview(state,preview.id,thread.revisionId)).catch(()=>{});}}>View saved revision {preview.revisions.findIndex(r=>r.id===thread.revisionId)+1}</button>}<ReviewThreadCard thread={thread} onReply={body=>comments.reply(thread.id,body)} onResolve={value=>comments.resolve(thread.id,value)}/></div>)}
  </aside>;
}
