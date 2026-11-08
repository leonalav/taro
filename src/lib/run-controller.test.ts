import { describe, expect, it, vi } from "vitest";
import { RunController } from "./run-controller";
import type { RunLedger, ToolIntent, ToolOutcome } from "./foundation-native";
function storage(){
 const scope={workspaceRoot:"/project",sessionId:"chat",runId:"run"};
 const ledger={scope,reserveRequest:vi.fn(async(id:string,kind:string)=>({attemptId:id,runId:"run",rootRunId:"run",kind,ordinal:1})),appendExchange:vi.fn(async()=>1),recordIntent:vi.fn(async(intent:ToolIntent)=>({intent,state:"intent",outcome:null})),markStarted:vi.fn(),persistOutput:vi.fn(async()=>"foundation-output:test"),readOutput:vi.fn(),recordOutcome:vi.fn(async(_id:string,outcome:ToolOutcome)=>({intent:{},state:outcome.state,outcome})),saveMetadata:vi.fn(),saveContext:vi.fn(),load:vi.fn(),finish:vi.fn()};
 return ledger;
}
const intent={attemptId:"a",operationId:"op",tool:"Write",input:{file_path:"a.txt",content:"new"},sideEffect:true};
describe("write-ahead run controller",()=>{
 it("rechecks a pause after a waiting dispatch claim and never invokes its side effect",async()=>{
  const ledger=storage();let release!:()=>void;
  ledger.markStarted.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
  const controller=new RunController(ledger as unknown as RunLedger);const execute=vi.fn(async()=>({text:"must not execute"}));
  const first=controller.executeTool(intent,execute);
  await vi.waitFor(()=>expect(ledger.markStarted).toHaveBeenCalledOnce());
  ledger.recordIntent.mockRejectedValueOnce(Error("disk failure"));
  await expect(controller.executeTool({...intent,attemptId:"other"},async()=>({text:"other"}))).rejects.toThrow("disk failure");
  release();await expect(first).rejects.toThrow(/paused/i);expect(execute).not.toHaveBeenCalled();
 });
 it("preserves full results before acknowledging success and coalesces matching UI duplicates",async()=>{
  const ledger=storage();const controller=new RunController(ledger as unknown as RunLedger);
  const value={text:"full output ".repeat(10000)};const execute=vi.fn(async()=>value);
  const [first,second]=await Promise.all([controller.executeTool(intent,execute),controller.executeTool(intent,execute)]);
  expect(first).toBe(value);expect(second).toBe(value);expect(execute).toHaveBeenCalledOnce();
  expect(ledger.persistOutput).toHaveBeenCalledWith("a",value);
  expect(ledger.recordOutcome).toHaveBeenCalledWith("a",expect.objectContaining({state:"succeeded",outputRef:"foundation-output:test"}));
 });
 it("rejects conflicting concurrent inputs instead of sharing a different execution",async()=>{
  const ledger=storage();const controller=new RunController(ledger as unknown as RunLedger);
  const original=controller.executeTool(intent,async()=>({text:"original"}));
  await expect(controller.executeTool({...intent,input:{file_path:"different.txt"}},async()=>({text:"wrong"}))).rejects.toThrow(/conflict/i);
  await original;
 });
 it("does not execute a side effect when intent persistence fails",async()=>{
  const ledger=storage();ledger.recordIntent.mockRejectedValueOnce(Error("disk full"));const controller=new RunController(ledger as unknown as RunLedger);const execute=vi.fn();
  await expect(controller.executeTool(intent,execute)).rejects.toThrow(/disk full/);expect(execute).not.toHaveBeenCalled();
  await expect(controller.beforeModelRequest("next")).rejects.toThrow(/paused/i);
 });
 it("pauses on lost outcome persistence and retains the durable started intent",async()=>{
  const ledger=storage();ledger.recordOutcome.mockRejectedValueOnce(Error("write failed"));const controller=new RunController(ledger as unknown as RunLedger);const execute=vi.fn(async()=>({text:"written"}));
  await expect(controller.executeTool(intent,execute)).rejects.toThrow(/outcome/i);expect(execute).toHaveBeenCalledOnce();expect(ledger.markStarted).toHaveBeenCalledWith("a");
  await expect(controller.beforeModelRequest("next")).rejects.toThrow(/paused/i);
 });
 it("never redispatches a previously started attempt",async()=>{
  const ledger=storage();ledger.recordIntent.mockResolvedValueOnce({intent,state:"started",outcome:null});const controller=new RunController(ledger as unknown as RunLedger);const execute=vi.fn();
  await expect(controller.executeTool(intent,execute)).rejects.toThrow(/reconcil/i);expect(execute).not.toHaveBeenCalled();
 });
 it("reserves before dispatch and records failed side effects as unknown",async()=>{
  const ledger=storage();const controller=new RunController(ledger as unknown as RunLedger);
  await controller.beforeModelRequest("request");expect(ledger.reserveRequest).toHaveBeenCalledWith("request","model");
  await expect(controller.executeTool(intent,async()=>{throw Error("connection lost");})).rejects.toThrow(/connection lost/);
  expect(ledger.recordOutcome).toHaveBeenCalledWith("a",expect.objectContaining({state:"unknown"}));
 });
 it("keeps ordinary read failures available to the model without marking them as side effects",async()=>{
  const ledger=storage();const controller=new RunController(ledger as unknown as RunLedger);
  await expect(controller.executeTool({...intent,tool:"Read",sideEffect:false},async()=>{throw Error("missing file");})).rejects.toThrow(/missing file/);
  expect(ledger.recordOutcome).toHaveBeenCalledWith("a",expect.objectContaining({state:"failed"}));
  await expect(controller.beforeModelRequest("repair")).resolves.toMatchObject({ordinal:1});
 });
});
