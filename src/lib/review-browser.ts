import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ReviewObservation, ReviewRect, Viewport } from './review-store';
import type { ArtifactAuditReport } from './artifact-audit';
export type BrowserPoint={x:number;y:number};
export interface BrowserEnvironment { deviceScale?:number;scheme?:'light'|'dark';reducedMotion?:boolean }
export interface BrowserInput {
  type:'hover'|'click'|'scroll'|'drag'|'text'|'key';
  selector?:string;relative?:BrowserPoint;x?:number;y?:number;leave?:boolean;
  to?:BrowserPoint;toSelector?:string;toRelative?:BrowserPoint;durationMs?:number;
  deltaX?:number;deltaY?:number;text?:string;key?:string;shift?:boolean;ctrl?:boolean;alt?:boolean;meta?:boolean;
}
export interface BrowserReplayPlan {
  name:string;
  steps:{label?:string;input:BrowserInput;expect?:{selector:string;present?:boolean;inViewport?:boolean;focused?:boolean;text?:string}}[];
}
export interface BrowserDiagnosticEvent {
  id:number;kind:'http'|'network'|'exception'|'console'|'dialog';at:number;
  level:'error'|'warning'|'assert';url?:string;line?:number;status?:number;reason?:string;resourceType?:string;
}
export interface BrowserDiagnostics {
  events:BrowserDiagnosticEvent[];truncated:boolean;missingImages:{selector:string;url?:string}[];
  slowFramesSupported:boolean;slowFrames:{startMs:number;durationMs:number;blockingMs:number}[];
}
export interface BrowserEvidenceMetadata extends Required<BrowserEnvironment> {
  mode:'viewport'|'document'|'element'|'region';bounds:ReviewRect;viewport:Viewport;scroll:BrowserPoint;
  browserVersion:string;capturedAt:number;navigationId:string;url?:string;selector?:string;sceneState?:string;renderer?:'webgl'|'fallback'|'pending'|'page';
}
export interface BrowserEvidenceFrame {
  id:string;screenshot:string;evidence:BrowserEvidenceMetadata;label?:string;step?:number;checkpoint?:number;elapsedMs?:number;
}
export interface BrowserEvidenceRun {
  id:string;kind:'replay'|'observed-motion'|'animation-checkpoints'|'scene-checkpoints';name:string;
  createdAt:number;status:'passed'|'failed'|'incomplete';truncated:boolean;frames:BrowserEvidenceFrame[];
  steps:{index:number;label:string;status:'passed'|'failed';transitioned?:boolean;durationMs?:number;error?:string;events:BrowserDiagnosticEvent[];frameId:string}[];
}
export interface BrowserCapture extends ReviewObservation {
  screenshot:string;captureId?:string;source?:string;audit?:ArtifactAuditReport;
  state?:{focusedSelector?:string;actionDurationMs?:number};diagnostics?:BrowserDiagnostics;
  evidence?:BrowserEvidenceMetadata;run?:BrowserEvidenceRun;
}
export interface BrowserRequest {
  key:string;action:'open'|'inspect'|'capture'|'save'|'viewport'|'input'|'back'|'forward'|'reload'|'close'|'audit'|'replay'|'motion';
  spacing?:number[];
  isolated?:boolean;
  url?:string;html?:string;viewport?:Viewport;selector?:string;point?:{x:number;y:number};anchors?:string[];
  input?:BrowserInput;
  environment?:BrowserEnvironment;
  capture?:{mode:BrowserEvidenceMetadata['mode'];selector?:string;rect?:ReviewRect};
  replay?:BrowserReplayPlan;
  motion?:{selector?:string;checkpoints?:number[];sceneCheckpoints?:string[];prepareSelector?:string;frames?:number;intervalMs?:number};
}
export interface BrowserLiveFrame { screenshot:string;viewport:Viewport;receivedAt:number }
interface BrowserLiveRequest { key:string;action:'live-frame'|'stop-live';liveId:string }

async function sendBrowserRequest<Result>(request:BrowserRequest|BrowserLiveRequest):Promise<Result> {
  if(isTauri())return invoke('review_browser',{request});
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
  try{
    const response=await fetch('/__taro_review',{method:'POST',headers:{'Content-Type':'application/json','X-Taro-Review':'1'},body:JSON.stringify(request),signal:controller.signal});
    const value=await response.json().catch(()=>{throw Error('Live previews require the Taro desktop app or the development server.');});
    if(!response.ok||value.error)throw Error(value.error??'Preview browser failed.');
    return value;
  }catch(error){if(controller.signal.aborted)throw Error('Preview browser timed out. Retry opening the preview.');throw error;}
  finally{clearTimeout(timeout);}
}
export const requestReviewBrowser=(request:BrowserRequest)=>sendBrowserRequest<BrowserCapture>(request);
export const requestReviewLiveFrame=(key:string,liveId:string)=>sendBrowserRequest<BrowserLiveFrame|{screenshot?:undefined}>({key,liveId,action:'live-frame'});
export const stopReviewLiveFrames=(key:string,liveId:string)=>sendBrowserRequest<{stopped:boolean}>({key,liveId,action:'stop-live'});

// Observed captures are ephemeral; original source/revisions and comment threads live in the repository.
const captures=new Map<string,BrowserCapture>(),listeners=new Set<()=>void>();
export const reviewCapture=(key:string)=>captures.get(key);
export const publishReviewCapture=(key:string,value:BrowserCapture)=>{captures.set(key,value);listeners.forEach(fn=>fn());};
export const subscribeReviewCaptures=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const browserPreviewKey=(scopeKey:string,previewId:string,revisionId:string)=>JSON.stringify([scopeKey,previewId,revisionId]);
