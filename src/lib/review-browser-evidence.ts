import type { BrowserCapture, BrowserDiagnostics, BrowserEvidenceFrame, BrowserEvidenceMetadata, BrowserEvidenceRun, BrowserReplayPlan } from './review-browser';
import type { ReviewAnchor } from './review-store';

export interface SavedBrowserEvidence extends Omit<BrowserEvidenceRun,'kind'> {
  kind:BrowserEvidenceRun['kind']|'capture';
  revisionId:string;
  diagnostics?:BrowserDiagnostics;
  replay?:BrowserReplayPlan;
}

export function saveBrowserEvidence(capture:BrowserCapture,revisionId:string,replay?:BrowserReplayPlan):SavedBrowserEvidence{
  if(!capture.evidence||!capture.captureId)throw Error('The browser returned no evidence metadata.');
  const evidence:SavedBrowserEvidence=capture.run
    ? {...capture.run,revisionId,diagnostics:capture.diagnostics}
    : {id:capture.captureId,kind:'capture',name:`${capture.evidence.mode} capture`,createdAt:capture.evidence.capturedAt,
      revisionId,status:'passed',truncated:false,steps:[],diagnostics:capture.diagnostics,
      frames:[{id:capture.captureId,screenshot:capture.screenshot,evidence:capture.evidence}]};
  if(replay)evidence.replay={name:replay.name,steps:replay.steps.map(step=>{
    const {text:_,...input}=step.input;
    return {...step,input};
  })};
  return validateBrowserEvidence(evidence,revisionId);
}

export function validateBrowserEvidence(value:SavedBrowserEvidence,revisionId:string):SavedBrowserEvidence{
  if(!value||typeof value.id!=='string'||!value.id||typeof value.name!=='string'||value.revisionId!==revisionId||
    !Number.isFinite(value.createdAt)||!['capture','replay','observed-motion','animation-checkpoints','scene-checkpoints'].includes(value.kind)||
    !['passed','failed','incomplete'].includes(value.status)||!Array.isArray(value.frames)||value.frames.length>7||!Array.isArray(value.steps)||value.steps.length>6)throw Error('Invalid saved browser evidence.');
  for(const frame of value.frames){
    const metadata=frame?.evidence;
    if(!frame||typeof frame.id!=='string'||typeof frame.screenshot!=='string'||!frame.screenshot.startsWith('data:image/png;base64,')||
      !metadata||!validEvidenceMetadata(metadata))throw Error('Invalid saved browser frame.');
  }
  return value;
}

function validEvidenceMetadata(metadata:BrowserEvidenceMetadata){
  return ['viewport','document','element','region'].includes(metadata.mode)&&typeof metadata.browserVersion==='string'&&
    Number.isFinite(metadata.capturedAt)&&metadata.bounds&&metadata.viewport&&metadata.scroll&&
    [metadata.bounds.x,metadata.bounds.y,metadata.bounds.width,metadata.bounds.height,
      metadata.viewport.width,metadata.viewport.height,metadata.scroll.x,metadata.scroll.y,metadata.deviceScale].every(Number.isFinite)&&
    metadata.bounds.width>0&&metadata.bounds.height>0;
}

export function summarizeBrowserEvidence({frames,...report}:SavedBrowserEvidence){
  return {...report,frames:frames.map(({screenshot:_,...frame})=>frame)};
}

export function browserEvidenceAnchor(report:SavedBrowserEvidence,frame:BrowserEvidenceFrame,x:number,y:number):ReviewAnchor {
  const {evidence}=frame,{bounds,viewport}=evidence;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<bounds.x||y<bounds.y||x>=bounds.x+bounds.width||y>=bounds.y+bounds.height)throw Error('Comment position must be inside the saved frame in document CSS pixels.');
  return {x,y,viewport,evidenceId:report.id,evidenceFrameId:frame.id};
}
