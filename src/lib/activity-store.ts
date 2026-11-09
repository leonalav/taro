import type {HeatDay} from '@/data/statistics';
export type ActivityKind='message'|'code'|'task'|'commit'|'review'|'design';
export interface ActivityEvent {id:string;workspace:string;kind:ActivityKind;timestamp:number}
export interface ActivityStorageStatus {error:string|null;unsaved:boolean;needsRepair:boolean}
const KEY='taro-activity-v1';
const localDate=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
class MalformedActivity extends Error {}
function validEvent(event:unknown):event is ActivityEvent {
  if(!event||typeof event!=='object')return false;
  const value=event as ActivityEvent;
  return typeof value.id==='string'&&!!value.id&&typeof value.workspace==='string'&&!!value.workspace&&['message','code','task','commit','review','design'].includes(value.kind)&&Number.isFinite(value.timestamp)&&Number.isFinite(new Date(value.timestamp).getTime());
}
function readEvents(raw:string|null):ActivityEvent[]{
  let value:unknown;
  try{value=JSON.parse(raw??'[]');}catch{throw new MalformedActivity('Saved activity data is malformed.');}
  if(!Array.isArray(value)||!value.every(validEvent))throw new MalformedActivity('Saved activity contains invalid records.');
  return value;
}
function uniqueEvents(events:ActivityEvent[]):ActivityEvent[]{
  const seen=new Set<string>();
  return events.filter(event=>{const key=JSON.stringify([event.workspace,event.id]);if(seen.has(key))return false;seen.add(key);return true;});
}
function sameEvents(a:ActivityEvent[],b:ActivityEvent[]){return a.length===b.length&&a.every((event,index)=>event.id===b[index].id&&event.workspace===b[index].workspace&&event.kind===b[index].kind&&event.timestamp===b[index].timestamp);}
export function createActivityStore(storage?:Pick<Storage,'getItem'|'setItem'>,now=Date.now){
  let events:ActivityEvent[]=[],dirty=false;
  let status:ActivityStorageStatus={error:null,unsaved:false,needsRepair:false};
  const listeners=new Set<()=>void>(),statusListeners=new Set<()=>void>();
  const publishStatus=(next:ActivityStorageStatus)=>{
    if(status.error===next.error&&status.unsaved===next.unsaved&&status.needsRepair===next.needsRepair)return;
    status=next;statusListeners.forEach(listener=>listener());
  };
  const read=()=>{if(!storage)throw Error('Activity storage is unavailable.');return uniqueEvents(readEvents(storage.getItem(KEY)));};
  const failed=(error:unknown)=>{
    const needsRepair=error instanceof MalformedActivity;
    publishStatus({error:needsRepair?'Saved activity could not be read. Its original data was preserved. Restore the saved history, then retry saving.':`Activity could not be saved: ${String(error)}. Confirmed events remain in this session; retry saving before closing the app.`,unsaved:dirty,needsRepair});
  };
  try{events=read();}catch(error){failed(error);}
  const save=()=>{
    try{
      // Re-read before writing, preserving both previously saved and session-only evidence.
      // In particular, malformed raw history is never replaced by an empty ledger.
      const merged=uniqueEvents([...read(),...events]);
      storage!.setItem(KEY,JSON.stringify(merged));
      const changed=!sameEvents(events,merged);if(changed)events=merged;
      dirty=false;publishStatus({error:null,unsaved:false,needsRepair:false});return {saved:true,changed};
    }catch(error){failed(error);return {saved:false,changed:false};}
  };
  return {
    snapshot:()=>events,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    storageStatus:()=>status,
    subscribeStorageStatus:(listener:()=>void)=>{statusListeners.add(listener);return()=>{statusListeners.delete(listener);};},
    retryPersistence:()=>{const outcome=save();if(outcome.changed)listeners.forEach(listener=>listener());return outcome.saved;},
    record(event:ActivityEvent){
      if(!validEvent(event)||event.timestamp>now()+60_000||events.some(existing=>existing.id===event.id&&existing.workspace===event.workspace))return false;
      events=[...events,event];dirty=true;save();listeners.forEach(listener=>listener());return true;
    },
  };
}
export function activityHeatmap(events:readonly ActivityEvent[],months:number,end=new Date()):HeatDay[]{
  const cursor=new Date(end);cursor.setHours(0,0,0,0);cursor.setDate(1);cursor.setMonth(cursor.getMonth()-months);
  const counts=new Map<string,number>();for(const event of events){const key=localDate(new Date(event.timestamp));counts.set(key,(counts.get(key)??0)+1);}
  const days:HeatDay[]=[];
  while(cursor<=end){const date=localDate(cursor),count=counts.get(date)??0;days.push({date,count,label:`${cursor.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})} · ${count} contribution${count===1?'':'s'}`});cursor.setDate(cursor.getDate()+1);}
  return days;
}
let storage:Storage|undefined;try{storage=typeof window==='undefined'?undefined:window.localStorage;}catch{/* The store exposes unavailable-storage status. */}
const activity=createActivityStore(storage);
export const getActivitySnapshot=activity.snapshot;
export const subscribeActivity=activity.subscribe;
export const recordActivity=activity.record;
export const getActivityStorageStatus=activity.storageStatus;
export const subscribeActivityStorageStatus=activity.subscribeStorageStatus;
export const retryActivityPersistence=activity.retryPersistence;

/** A stable two-word content hash for local deduplication, not authentication. */
function designFingerprint(content:string){
  let a=0x811c9dc5,b=0x9e3779b9;
  for(let index=0;index<content.length;index++){
    const code=content.charCodeAt(index);a=Math.imul(a^code,0x01000193);b=Math.imul(b^code,0x5bd1e995);b^=b>>>15;
  }
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export function recordDesignActivity(input:{workspace:string;path:string;markdown:string;timestamp?:number}):boolean {
  if(!input.path.trim()||!input.markdown.trim())return false;
  let path=input.path.replace(/\\/g,'/').replace(/^\/\/\?\//,'').replace(/\/+$/,'');
  if(/^[a-z]:\//i.test(path))path=path.toLowerCase();
  const fingerprint=designFingerprint(`${path}\0${input.markdown.replace(/\r\n/g,'\n')}`);
  return recordActivity({id:`design:${fingerprint}`,workspace:input.workspace,kind:'design',timestamp:input.timestamp??Date.now()});
}
