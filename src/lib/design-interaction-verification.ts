import type { InteractionProof } from './project-direction';
import type { BrowserInput } from './review-browser';

interface ReplayStep {
  input: Partial<BrowserInput>;
  expect?: Record<string, unknown>;
}

const propertyOrder = (value: Record<string, unknown>) => Object.entries(value).sort(([left],[right])=>left.localeCompare(right));
const point = (value: BrowserInput['relative']) => value ? [value.x,value.y] : undefined;

export function designReplaySignature(proof:InteractionProof, steps:ReplayStep[], transitions:readonly boolean[], textDigest?:string) {
  if(!Array.isArray(steps)||!steps.some((step,index)=>transitions[index]===true&&step.input.type===proof.type&&step.input.selector===proof.target&&step.expect&&JSON.stringify(propertyOrder(step.expect))===JSON.stringify(propertyOrder(proof.expect))))return undefined;
  if(!textDigest&&steps.some(step=>step.input.type==='text'))return undefined;
  return JSON.stringify([textDigest,steps.map(({input,expect})=>[
    input.type,input.selector,input.key,input.toSelector,point(input.relative),point(input.toRelative),point(input.to),
    input.x,input.y,input.deltaX,input.deltaY,input.durationMs,!!input.shift,!!input.ctrl,!!input.alt,!!input.meta,!!input.leave,
    expect&&propertyOrder(expect),
  ])]);
}

export async function replayTextDigest(steps:ReplayStep[], request:Record<string,unknown>) {
  if(!Array.isArray(steps))return undefined;
  const supplied=Array.isArray(request.steps)?request.steps as ReplayStep[]:undefined;
  const saved=request.text_values as Record<string,string>|undefined;
  const values=steps.flatMap((step,index)=>step.input.type==='text'?[supplied?.[index]?.input?.text??saved?.[index]]:[]);
  if(!values.length||values.some(value=>typeof value!=='string'))return undefined;
  // Review receipts omit typed values. Compare them in memory without adding them to saved evidence.
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(values)));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
