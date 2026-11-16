import * as React from 'react';
import { X } from 'lucide-react';
import type { BrowserDiagnostics } from '@/lib/review-browser';
import type { SavedBrowserEvidence } from '@/lib/review-browser-evidence';
import type { ReviewPreview, Viewport } from '@/lib/review-store';
import { encodeReviewMotionVideo, reviewMotionVideoFormat } from '@/lib/review-motion-video';
import { CommentComposer, ReviewMarkdown } from './review-comments';

interface Props {
  preview:ReviewPreview;
  viewport:Viewport;
  selectedSelector?:string;
  diagnostics?:BrowserDiagnostics;
  live:boolean;
  onClose:()=>void;
  onCapture:(mode:string,selector?:string)=>Promise<string>;
  onReplay:(id:string)=>Promise<string>;
  onComment:(id:string,index:number,x:number,y:number,body:string)=>Promise<void>;
}

export function ReviewBrowserEvidencePanel({preview,viewport,selectedSelector,diagnostics,live,onClose,onCapture,onReplay,onComment}:Props){
  const reports=preview.revisions.flatMap(revision=>revision.browserEvidence??[]).sort((a,b)=>b.createdAt-a.createdAt);
  const [reportId,setReportId]=React.useState('');
  const [frameIndex,setFrameIndex]=React.useState(-1);
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  const [exporting,setExporting]=React.useState(false);
  const [point,setPoint]=React.useState<{x:number;y:number}>();
  const report=reports.find(item=>item.id===reportId)??reports[0];
  const index=frameIndex<0?(report?.frames.length??0)-1:frameIndex;
  const frame=report?.frames[index],latest=preview.revisions.at(-1)?.id;
  const relatedThreads=preview.threads.filter(thread=>thread.anchor.evidenceId===report?.id&&thread.anchor.evidenceFrameId===frame?.id&&!!frame);
  const evidence=frame?.evidence,bounds=evidence?.bounds;
  const motion=report&&['observed-motion','animation-checkpoints','scene-checkpoints'].includes(report.kind);
  const videoFormat=motion&&report.frames.length>1?reviewMotionVideoFormat():undefined;

  const run=async(work:()=>Promise<string>)=>{
    setBusy(true);setError('');setPoint(undefined);
    try{setReportId(await work());setFrameIndex(-1);}catch(error){setError(String(error));}
    finally{setBusy(false);}
  };
  const select=(item:SavedBrowserEvidence)=>{setReportId(item.id);setFrameIndex(-1);setPoint(undefined);};
  const downloadFilmstrip=async(item:SavedBrowserEvidence)=>{
    setExporting(true);setError('');
    try{
      const {blob,extension}=await encodeReviewMotionVideo(item.frames);
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;
      link.download=`motion-${item.id.replace(/[^a-z0-9_-]/gi,'-')}.${extension}`;
      link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(cause){setError(String(cause));}
    finally{setExporting(false);}
  };
  return <aside className="review-side-panel review-evidence-panel" aria-label="Browser evidence">
    <header><strong>Browser evidence</strong><button type="button" aria-label="Close browser evidence" onClick={onClose}><X/></button></header>
    {live&&<div className="review-evidence-actions">
      <button type="button" disabled={busy} onClick={()=>void run(()=>onCapture('viewport'))}>Save viewport</button>
      <button type="button" disabled={busy} onClick={()=>void run(()=>onCapture('document'))}>Save full page</button>
      <button type="button" disabled={busy||!selectedSelector} onClick={()=>void run(()=>onCapture('element',selectedSelector))}>Save component</button>
      <button type="button" disabled={busy} onClick={()=>void run(()=>onCapture('observed-motion'))}>Sample motion</button>
    </div>}
    {error&&<p role="alert" className="review-error">{error}</p>}
    {reports.length>0&&<div className="review-component-list" aria-label="Saved browser runs">
      {reports.map(item=><button key={item.id} type="button" aria-pressed={item.id===report?.id} onClick={()=>select(item)}>
        <strong>{item.name}</strong><span>{item.revisionId!==latest?'Historical revision':item.kind==='capture'?'Saved':item.status}</span>
      </button>)}
    </div>}
    {report&&<section className="review-evidence-result">
      {report.replay&&live&&<button type="button" className="review-primary" disabled={busy||report.replay.steps.some(step=>step.input.type==='text')} onClick={()=>void run(()=>onReplay(report.id))}>
        Replay at {viewport.width} × {viewport.height}
      </button>}
      {report.replay?.steps.some(step=>step.input.type==='text')&&<p>This sequence needs text values. An agent can supply them when replaying.</p>}
      {report.truncated&&<p>Some frames or diagnostics exceeded the run limit.</p>}
      {report.steps.length>0&&<ol className="review-evidence-steps" aria-label="Replay steps">
        {report.steps.map(step=>{
          const frameIndex=report.frames.findIndex(frame=>frame.id===step.frameId);
          return <li key={step.index}><button type="button" disabled={frameIndex<0} onClick={()=>{setFrameIndex(frameIndex);setPoint(undefined);}}>
            {step.label} · {step.status}
          </button>{step.error&&<p>{step.error}</p>}
            {step.events.map(event=><p key={event.id}>{event.kind} {event.status??event.level} {event.url??event.reason}</p>)}
          </li>;
        })}
      </ol>}
      {report.frames.length>1&&<div className="review-evidence-actions" aria-label="Saved frames">
        {report.frames.map((item,i)=><button type="button" key={item.id} aria-pressed={i===index} onClick={()=>{setFrameIndex(i);setPoint(undefined);}}>{item.label??`Frame ${i+1}`}</button>)}
      </div>}
      {frame&&bounds&&evidence&&<>
        <figure className="review-evidence-frame">
          <button type="button" aria-label="Comment on a point in this saved frame" onClick={event=>{
            const box=event.currentTarget.getBoundingClientRect();
            const localX=event.detail&&box.width?(event.clientX-box.left)/box.width:.5;
            const localY=event.detail&&box.height?(event.clientY-box.top)/box.height:.5;
            setPoint({x:bounds.x+Math.max(0,Math.min(.999,localX))*bounds.width,y:bounds.y+Math.max(0,Math.min(.999,localY))*bounds.height});
          }}>
            <img src={frame.screenshot} alt={frame.label??report.name} draggable={false}/>
            {relatedThreads.map((thread,i)=><span key={thread.id} className="review-pin" style={{left:`${100*(thread.anchor.x-bounds.x)/bounds.width}%`,top:`${100*(thread.anchor.y-bounds.y)/bounds.height}%`}}>{i+1}</span>)}
          </button>
          <figcaption>{evidence.viewport.width} × {evidence.viewport.height} CSS px · {evidence.deviceScale}×
            {evidence.sceneState&&` · ${evidence.sceneState}`}{frame.elapsedMs!==undefined&&` · ${frame.elapsedMs} ms`}
            {evidence.renderer&&` · ${evidence.renderer}`}
          </figcaption>
        </figure>
        {point&&<CommentComposer compact autoFocus label="Comment on saved browser evidence" onCancel={()=>setPoint(undefined)} onSubmit={async body=>{
          await onComment(report.id,index,point.x,point.y,body);setPoint(undefined);
        }}/>}
        {relatedThreads.map((thread,i)=><div className="review-evidence-thread" key={thread.id}><strong>{i+1}. {thread.messages[0].author}</strong><ReviewMarkdown body={thread.messages[0].body}/></div>)}
      </>}
      {motion&&<>
        {report.frames.length>1&&(videoFormat?
          <button type="button" className="review-primary" disabled={exporting} onClick={()=>void downloadFilmstrip(report)}>
            {exporting?'Preparing filmstrip…':'Download filmstrip video'}
          </button>:
          <p>Filmstrip video export is unavailable in this browser.</p>)}
        <p>The filmstrip uses saved PNG frames. {report.kind==='observed-motion'?'Timing reflects sampled intervals, with long gaps shortened.':'Checkpoints are shown at even intervals.'} Playback smoothness needs separate measurement.</p>
      </>}
      <ReviewBrowserDiagnostics diagnostics={report.diagnostics}/>
    </section>}
    {!report&&<ReviewBrowserDiagnostics diagnostics={diagnostics}/>}
  </aside>;
}

function ReviewBrowserDiagnostics({diagnostics}: {diagnostics?:BrowserDiagnostics}){
  if(!diagnostics)return null;
  const events=diagnostics.events.slice(-10);
  return <section className="review-evidence-diagnostics" aria-label="Browser diagnostics">
    <strong>Browser diagnostics</strong>
    {events.length===0&&diagnostics.missingImages.length===0&&<p>No console errors or failed requests in the observed window.</p>}
    {events.length>0&&<ul>{events.map(event=><li key={event.id}>{event.kind} {event.status??event.level} {event.url??event.reason}{event.line? ` · line ${event.line}`:''}</li>)}</ul>}
    {diagnostics.missingImages.map(image=><p key={image.selector}>Image unavailable · {image.url??image.selector}</p>)}
    <p>{diagnostics.slowFramesSupported?`${diagnostics.slowFrames.length} slow frames observed`:'Slow-frame observations unavailable'}</p>
    {diagnostics.truncated&&<p>Diagnostic history was truncated.</p>}
  </section>;
}
