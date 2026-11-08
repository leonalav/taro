const CONCURRENCY_SAFE_TOOLS=new Set(["Read","ListFiles","Glob","Grep"]);
const MAX_CONCURRENT_INSPECTIONS=10;

export const isConcurrencySafeTool=(name:string)=>CONCURRENCY_SAFE_TOOLS.has(name);

/** Preserve model call order while allowing adjacent filesystem inspections to overlap. */
export async function runToolCallsInBatches<T extends {name:string},R>(
 calls:readonly T[],execute:(call:T)=>Promise<R>,shouldStop:()=>boolean,
):Promise<R[]>{
 const results:R[]=[];
 for(let index=0;index<calls.length && !shouldStop();){
  if(!isConcurrencySafeTool(calls[index].name)){
   results.push(await execute(calls[index]));index++;continue;
  }
  let end=index;
  while(end<calls.length && end-index<MAX_CONCURRENT_INSPECTIONS && isConcurrencySafeTool(calls[end].name))end++;
  results.push(...await Promise.all(calls.slice(index,end).map(execute)));
  index=end;
 }
 return results;
}
