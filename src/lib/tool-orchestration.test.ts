import {describe, expect, it} from "vitest";
import {isConcurrencySafeTool, runToolCallsInBatches} from "./tool-orchestration";

const call=(name:string,id:string)=>({name,id});
const deferred=()=>{let resolve!:(value:string)=>void;const promise=new Promise<string>(done=>{resolve=done;});return {promise,resolve};};

describe("tool orchestration",()=>{
 it("only treats dedicated filesystem inspection as concurrency safe",()=>{
  expect(["Read","ListFiles","Glob","Grep"].every(isConcurrencySafeTool)).toBe(true);
  expect(["Write","Edit","NotebookEdit","Bash","MCP","Unknown"].some(isConcurrencySafeTool)).toBe(false);
 });
 it("runs consecutive inspections together and returns results in model call order",async()=>{
  const first=deferred(),second=deferred();const started:string[]=[];
  const work=runToolCallsInBatches([call("Read","1"),call("Grep","2")],async item=>{started.push(item.id);return item.id==="1"?first.promise:second.promise;},()=>false);
  await Promise.resolve();expect(started).toEqual(["1","2"]);
  second.resolve("second");first.resolve("first");
  expect(await work).toEqual(["first","second"]);
 });
 it("waits for inspections before a write and runs later inspections after it",async()=>{
  const first=deferred(),write=deferred();const started:string[]=[];
  const work=runToolCallsInBatches([call("Read","1"),call("Write","2"),call("Glob","3")],async item=>{started.push(item.id);return item.id==="1"?first.promise:item.id==="2"?write.promise:Promise.resolve("third");},()=>false);
  await Promise.resolve();expect(started).toEqual(["1"]);
  first.resolve("first");await new Promise(resolve=>setTimeout(resolve,0));expect(started).toEqual(["1","2"]);
  write.resolve("second");expect(await work).toEqual(["first","second","third"]);expect(started).toEqual(["1","2","3"]);
 });
 it("stops scheduling new batches after cancellation",async()=>{
  const first=deferred();let stopped=false;const started:string[]=[];
  const work=runToolCallsInBatches([call("Read","1"),call("Write","2")],async item=>{started.push(item.id);return item.id==="1"?first.promise:Promise.resolve("second");},()=>stopped);
  stopped=true;first.resolve("first");expect(await work).toEqual(["first"]);expect(started).toEqual(["1"]);
 });
 it("runs every call when an inspection batch exceeds the concurrency window",async()=>{
  const calls=Array.from({length:23},(_,index)=>call("Read",String(index)));
  const result=await runToolCallsInBatches(calls,async item=>item.id,()=>false);
  expect(result).toEqual(calls.map(item=>item.id));
 });
});
