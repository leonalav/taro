import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Scope } from "@/data/foundation";
export type RunState="active"|"paused"|"completed"|"failed"|"cancelled"|"interrupted";
export type ToolAttemptState="intent"|"started"|"succeeded"|"failed"|"cancelled"|"unknown";
export interface RunLimits {requestLimit:number;activeTimeLimitMs:number}
export interface RunRecord {scope:Scope;rootRunId:string;state:RunState;limits:RunLimits;requestsReserved:number;contextEpoch:number;recoveryAttempts:number;metadata:Record<string,unknown>}
export interface ToolIntent {attemptId:string;operationId:string;tool:string;input:Record<string,unknown>;sideEffect:boolean}
export interface ToolOutcome {state:Exclude<ToolAttemptState,"intent"|"started">;preview:string;outputRef?:string|null}
export interface ToolAttempt {intent:ToolIntent;state:ToolAttemptState;outcome?:ToolOutcome|null}
export interface RequestReservation {attemptId:string;runId:string;rootRunId:string;kind:"model"|"child"|"summary";ordinal:number}
export interface ContextInput {sourceSequence:number;model:string;summary:unknown;tailStart:number}
export interface ContextEpoch {epoch:number;context:ContextInput}
export interface LoadedRun {run:RunRecord;exchanges:{id:string;sequence:number;payload:unknown}[];attempts:ToolAttempt[];events:{id:string;sequence:number;kind:string;payload:unknown}[];context?:ContextEpoch|null}
export interface RunLedger {
 readonly scope:Scope;
 reserveRequest(attemptId:string,kind:RequestReservation["kind"]):Promise<RequestReservation>;
 appendExchange(exchangeId:string,exchange:unknown):Promise<number>;
 persistOutput(attemptId:string,output:unknown):Promise<string>;
 readOutput(reference:string):Promise<unknown>;
 recordIntent(intent:ToolIntent):Promise<ToolAttempt>;
 markStarted(attemptId:string):Promise<ToolAttempt>;
 recordOutcome(attemptId:string,outcome:ToolOutcome):Promise<ToolAttempt>;
 saveMetadata(metadata:Record<string,unknown>):Promise<RunRecord>;
 saveContext(expectedEpoch:number,context:ContextInput):Promise<ContextEpoch>;
 load():Promise<LoadedRun>;
 finish(outcome:Exclude<RunState,"active">):Promise<RunRecord>;
}
/** No browser fallback: a UI cache is never presented as durable native storage. */
export class NativeRunLedger implements RunLedger {
 private constructor(readonly scope:Scope){}
 static async begin(scope:Scope,limits:RunLimits={requestLimit:128,activeTimeLimitMs:1800000}):Promise<NativeRunLedger>{
  if(!isTauri())throw Error("Durable task execution requires the desktop runtime");
  const run=await invoke<RunRecord>("foundation_begin_run",{scope,limits});
  if(run.scope.runId!==scope.runId||run.scope.sessionId!==scope.sessionId)throw Error("Native run identity mismatch");
  return new NativeRunLedger(run.scope);
 }
 static listRecoverable(){if(!isTauri())return Promise.reject(Error("Recovery requires the desktop runtime"));return invoke<RunRecord[]>("foundation_list_recoverable");}
 private call<T>(command:string,args:Record<string,unknown>={}):Promise<T>{return invoke<T>(command,{scope:this.scope,...args});}
 reserveRequest(attemptId:string,kind:RequestReservation["kind"]){return this.call<RequestReservation>("foundation_reserve_request",{attemptId,kind});}
 appendExchange(exchangeId:string,exchange:unknown){return this.call<number>("foundation_record_exchange",{exchangeId,exchange});}
 persistOutput(attemptId:string,output:unknown){return this.call<string>("foundation_persist_output",{attemptId,output});}
 readOutput(reference:string){return this.call<unknown>("foundation_read_output",{reference});}
 recordIntent(intent:ToolIntent){return this.call<ToolAttempt>("foundation_record_tool_intent",{intent});}
 markStarted(attemptId:string){return this.call<ToolAttempt>("foundation_mark_tool_started",{attemptId});}
 recordOutcome(attemptId:string,outcome:ToolOutcome){return this.call<ToolAttempt>("foundation_record_tool_outcome",{attemptId,outcome});}
 saveContext(expectedEpoch:number,context:ContextInput){return this.call<ContextEpoch>("foundation_save_context",{expectedEpoch,context});}
 saveMetadata(metadata:Record<string,unknown>){return this.call<RunRecord>("foundation_save_metadata",{metadata});}
 load(){return this.call<LoadedRun>("foundation_load_run");}
 finish(outcome:Exclude<RunState,"active">){return this.call<RunRecord>("foundation_finish_run",{outcome});}
}
