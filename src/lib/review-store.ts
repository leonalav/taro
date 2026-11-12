import { validateArtifactAudit, type ArtifactAuditReport } from './artifact-audit';
export interface ReviewScope { workspace: string; sessionId: string }
export interface Viewport { width: number; height: number }
export interface ReviewRect { x: number; y: number; width: number; height: number }
export interface ReviewComponent {
  selector: string; layerId?:string; tag: string; text: string; rect: ReviewRect; styles: Record<string, string>;
}
export interface ReviewAnchor { x: number; y: number; selector?: string; viewport?: Viewport; percent?: boolean }
export interface ReviewMessage { id: string; body: string; author: string; role: string; createdAt: number }
export interface ReviewThread { id: string; revisionId: string; anchor: ReviewAnchor; messages: ReviewMessage[]; resolved: boolean }
export interface ReviewObservation { url:string;title:string;viewport:Viewport;document:{width:number;height:number;scrollX:number;scrollY:number};components:ReviewComponent[];componentsTruncated?:boolean;selection?:ReviewComponent;anchors:Record<string,ReviewRect> }
export interface ReviewRevision { id: string; createdAt: number; url?: string; html?: string; capture?: string; source?: string; observation?:ReviewObservation; audits?:ArtifactAuditReport[]; layout?: import('./layout-designer').SavedLayout }
export interface ReviewPreview {
  id: string; title: string; kind: 'nike' | 'html' | 'url'; revisions: ReviewRevision[]; revisionId: string;
  viewport: Viewport; threads: ReviewThread[];
}
export interface ReviewState { version: 1; previews: ReviewPreview[]; activeId?: string }
export interface ReviewSnapshot { state: ReviewState; loaded: boolean; error?: string; unsaved?: boolean }
export interface ReviewStorage { read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void> }
let seq = 0;
export const reviewId = () => `review-${Date.now().toString(36)}-${++seq}-${crypto.randomUUID().slice(0,8)}`;
export const reviewScopeKey = (scope: ReviewScope) => {
  const path=scope.workspace.replace(/\\/g,'/').replace(/\/+$/,'');
  return JSON.stringify([/^[a-z]:|^\/\//i.test(path)?path.toLowerCase():path,scope.sessionId]);
};
export function validateViewport(viewport: Viewport): Viewport {
  if (![viewport.width, viewport.height].every(n => Number.isInteger(n) && n >= 100 && n <= 4096)) throw Error('Viewport width and height must be whole pixels between 100 and 4096.');
  return {width:viewport.width,height:viewport.height};
}
export function previewById(state: ReviewState, id?: string) {
  const preview=state.previews.find(p=>p.id===(id??state.activeId));
  if (!preview) throw Error('Preview was not found in this session.');
  return preview;
}
export const activeRevision = (preview: ReviewPreview) => preview.revisions.find(r=>r.id===preview.revisionId)!;
function updatePreview(state: ReviewState, id: string, update: (preview: ReviewPreview) => ReviewPreview): ReviewState {
  previewById(state,id);return {...state,previews:state.previews.map(p=>p.id===id?update(p):p)};
}
export function addPreview(state: ReviewState, input: {id?:string;revisionId?:string;title:string;kind:ReviewPreview['kind'];url?:string;html?:string;viewport?:Viewport;capture?:string;source?:string;observation?:ReviewObservation;layout?:ReviewRevision['layout']}): ReviewState {
  const id=input.id??reviewId();if(state.previews.some(p=>p.id===id))throw Error('Preview ID already exists.');
  if (!input.title.trim()) throw Error('A preview title is required.');
  const revision:ReviewRevision={id:input.revisionId??reviewId(),createdAt:Date.now(),url:input.url,html:input.html,capture:input.capture,source:input.source,observation:input.observation,layout:input.layout};
  return {...state,activeId:id,previews:[...state.previews,{id,title:input.title,kind:input.kind,revisions:[revision],revisionId:revision.id,viewport:validateViewport(input.viewport??{width:920,height:720}),threads:[]}]};
}
export function revisePreview(state: ReviewState,id:string,input:Omit<ReviewRevision,'id'|'createdAt'>,revisionId=reviewId()):ReviewState {
  return updatePreview(state,id,p=>{const revision={...input,id:revisionId,createdAt:Date.now()};return {...p,kind:p.kind==='nike'?'nike':input.html!==undefined?'html':'url',revisionId:revision.id,revisions:[...p.revisions,revision]};});
}
/** Complete a revision's first observation; the supplied source and earlier captures never change. */
export function attachReviewCapture(state:ReviewState,id:string,revisionId:string,data:{capture:string;source?:string;observation:ReviewObservation;title?:string}):ReviewState {
  return updatePreview(state,id,p=>{
    const revision=p.revisions.find(r=>r.id===revisionId);if(!revision)throw Error('Saved revision was not found.');
    if(revision.capture)return p;
    return {...p,title:data.title||p.title,revisions:p.revisions.map(r=>r.id===revisionId?{...r,capture:data.capture,source:data.source,observation:data.observation}:r)};
  });
}
export function selectPreview(state:ReviewState,id:string,revisionId?:string):ReviewState {
  const preview=previewById(state,id);
  if(revisionId&&!preview.revisions.some(r=>r.id===revisionId))throw Error('Saved revision was not found.');
  return {...updatePreview(state,id,p=>{const revision=p.revisions.find(r=>r.id===(revisionId??p.revisionId))!;return {...p,kind:p.kind==='nike'?'nike':revision.html!==undefined?'html':'url',revisionId:revision.id};}),activeId:id};
}
export function attachArtifactAudit(state:ReviewState,id:string,revisionId:string,report:ArtifactAuditReport):ReviewState {
  const validated=validateArtifactAudit(report);
  return updatePreview(state,id,p=>{
    if(!p.revisions.some(r=>r.id===revisionId))throw Error('Saved revision was not found.');
    return {...p,revisions:p.revisions.map(r=>r.id===revisionId?{...r,audits:[...r.audits??[],validated]}:r)};
  });
}
export const setReviewViewport=(state:ReviewState,id:string,viewport:Viewport)=>updatePreview(state,id,p=>({...p,viewport:validateViewport(viewport)}));
export function addReviewComment(state:ReviewState,id:string,input:{id?:string;revisionId?:string;body:string;author:string;role:string;anchor:ReviewAnchor}):ReviewState {
  if(!input.body.trim())throw Error('Comment text is required.');
  if(!Number.isFinite(input.anchor.x)||!Number.isFinite(input.anchor.y)||input.anchor.x<0||input.anchor.y<0)throw Error('Comment position must be finite, non-negative document coordinates.');
  return updatePreview(state,id,p=>{const revisionId=input.revisionId??p.revisionId;if(!p.revisions.some(r=>r.id===revisionId))throw Error('Comment revision was not found.');return {...p,threads:[...p.threads,{id:input.id??reviewId(),revisionId,anchor:input.anchor,resolved:false,messages:[{id:reviewId(),body:input.body,author:input.author,role:input.role,createdAt:Date.now()}]}]};});
}
function updateThread(state:ReviewState,id:string,threadId:string,update:(thread:ReviewThread)=>ReviewThread):ReviewState {
  return updatePreview(state,id,p=>{if(!p.threads.some(t=>t.id===threadId))throw Error('Comment thread was not found in this preview.');return {...p,threads:p.threads.map(t=>t.id===threadId?update(t):t)};});
}
export function replyToComment(state:ReviewState,id:string,threadId:string,input:{body:string;author:string;role:string}):ReviewState {
  if(!input.body.trim())throw Error('Reply text is required.');
  return updateThread(state,id,threadId,t=>({...t,messages:[...t.messages,{...input,id:reviewId(),createdAt:Date.now()}]}));
}
export const resolveComment=(state:ReviewState,id:string,threadId:string,resolved:boolean)=>updateThread(state,id,threadId,t=>({...t,resolved}));

function restore(raw:string|null):ReviewState {
  if(raw===null)return {version:1,previews:[]};
  const state=JSON.parse(raw) as ReviewState;
  if(state?.version!==1||!Array.isArray(state.previews))throw Error('Invalid saved review data.');
  const ids=new Set<string>();
  for(const p of state.previews){
    if(!p||typeof p.id!=='string'||ids.has(p.id)||typeof p.title!=='string'||!['nike','html','url'].includes(p.kind)||!Array.isArray(p.revisions)||!p.revisions.length||!Array.isArray(p.threads))throw Error('Invalid saved review artifact.');
    ids.add(p.id);validateViewport(p.viewport);
    if(!p.revisions.some(r=>r.id===p.revisionId))throw Error('Missing saved artifact revision.');
    const revisions=new Set<string>();
    for(const r of p.revisions){if(!r||typeof r.id!=='string'||revisions.has(r.id)||!Number.isFinite(r.createdAt)||['url','html','capture','source'].some(key=>r[key as keyof ReviewRevision]!==undefined&&typeof r[key as keyof ReviewRevision]!=='string'))throw Error('Invalid saved artifact content.');if(r.audits!==undefined){if(!Array.isArray(r.audits))throw Error('Invalid saved audits.');r.audits=r.audits.map(validateArtifactAudit);}revisions.add(r.id);}
    const threads=new Set<string>();
    for(const t of p.threads){if(!t||typeof t.id!=='string'||threads.has(t.id)||!revisions.has(t.revisionId)||typeof t.resolved!=='boolean'||!t.anchor||![t.anchor.x,t.anchor.y].every(n=>Number.isFinite(n)&&n>=0)||!Array.isArray(t.messages)||!t.messages.length||t.messages.some(m=>!m||typeof m.id!=='string'||typeof m.body!=='string'||typeof m.author!=='string'||typeof m.role!=='string'||!Number.isFinite(m.createdAt)))throw Error('Invalid saved review thread.');threads.add(t.id);}
  }
  if(state.activeId&&!ids.has(state.activeId))throw Error('Missing active preview.');
  return state;
}
export function createReviewRepository(storage:ReviewStorage) {
  const snapshots=new Map<string,ReviewSnapshot>(),loads=new Map<string,Promise<void>>(),queues=new Map<string,Promise<unknown>>(),listeners=new Set<()=>void>();
  const snapshot=(scope:ReviewScope):ReviewSnapshot=>{const key=reviewScopeKey(scope);let value=snapshots.get(key);if(!value){value={state:{version:1,previews:[]},loaded:false};snapshots.set(key,value);}return value;};
  const publish=(scope:ReviewScope,value:ReviewSnapshot)=>{snapshots.set(reviewScopeKey(scope),value);listeners.forEach(fn=>fn());};
  const load=(scope:ReviewScope)=>{const key=reviewScopeKey(scope);const previous=loads.get(key);if(previous)return previous;
    const promise=(async()=>{try{publish(scope,{state:restore(await storage.read(key)),loaded:true});}catch(error){publish(scope,{...snapshot(scope),loaded:false,error:`Could not read saved review data: ${String(error)}. Existing data is preserved.`});loads.delete(key);}})();loads.set(key,promise);return promise;};
  const change=(scope:ReviewScope,update:(state:ReviewState)=>ReviewState):Promise<void>=>{
    const key=reviewScopeKey(scope),work=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(async()=>{
      await load(scope);const current=snapshot(scope);if(!current.loaded)throw Error(current.error??'Saved review data is unavailable.');
      const state=update(current.state);
      try{await storage.write(key,JSON.stringify(state));publish(scope,{state,loaded:true});}
      catch(error){publish(scope,{state,loaded:true,unsaved:true,error:`Review changes could not be saved: ${String(error)}. Keep this session open and retry saving.`});throw error;}
    });queues.set(key,work);return work;
  };
  return {snapshot,load,change,retrySave:(scope:ReviewScope)=>change(scope,state=>state),subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
}
export type ReviewRepository=ReturnType<typeof createReviewRepository>;
