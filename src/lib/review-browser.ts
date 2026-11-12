import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ReviewObservation, Viewport } from './review-store';
import type { ArtifactAuditReport } from './artifact-audit';
export interface BrowserCapture extends ReviewObservation { screenshot:string;source?:string;audit?:ArtifactAuditReport }
export interface BrowserRequest {
  key:string;action:'open'|'inspect'|'capture'|'save'|'viewport'|'input'|'back'|'forward'|'reload'|'close'|'audit';
  spacing?:number[];
  isolated?:boolean;
  url?:string;html?:string;viewport?:Viewport;selector?:string;point?:{x:number;y:number};anchors?:string[];
  input?:{type:'click'|'scroll'|'text'|'key';x?:number;y?:number;deltaX?:number;deltaY?:number;text?:string;key?:string};
}
export async function requestReviewBrowser(request:BrowserRequest):Promise<BrowserCapture> {
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

// Observed captures are ephemeral; original source/revisions and comment threads live in the repository.
const captures=new Map<string,BrowserCapture>(),listeners=new Set<()=>void>();
export const reviewCapture=(key:string)=>captures.get(key);
export const publishReviewCapture=(key:string,value:BrowserCapture)=>{captures.set(key,value);listeners.forEach(fn=>fn());};
export const subscribeReviewCaptures=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const browserPreviewKey=(scopeKey:string,previewId:string,revisionId:string)=>JSON.stringify([scopeKey,previewId,revisionId]);
