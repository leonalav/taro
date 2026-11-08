import type { RunLedger, ToolIntent, ToolOutcome, RequestReservation, RunState } from "./foundation-native";

export class FoundationBoundaryError extends Error {
 constructor(message:string,readonly reason:"storage"|"uncertain"|"limit"|"paused"){super(message);this.name="FoundationBoundaryError";}
}
/** Orchestration only. Native dispatch must independently claim each mutation. */
export class RunController {
 private paused=false;
 private inFlight=new Map<string,{identity:string;work:Promise<unknown>}>();
 constructor(readonly ledger:RunLedger){}
 private assertActive(){if(this.paused)throw new FoundationBoundaryError("Task paused at a durable boundary. Resolve the reported failure before continuing.","paused");}
 private failure(message:string,error:unknown,reason:FoundationBoundaryError["reason"]="storage"){
  this.paused=true;return new FoundationBoundaryError(`${message}: ${String(error)}`,reason);
 }
 async beforeModelRequest(attemptId:string,kind:RequestReservation["kind"]="model"){
  this.assertActive();
  try{return await this.ledger.reserveRequest(attemptId,kind);}catch(error){throw this.failure("Model request was not dispatched",error,"limit");}
 }
 async recordModelExchange(exchangeId:string,exchange:unknown){
  this.assertActive();
  try{return await this.ledger.appendExchange(exchangeId,exchange);}catch(error){throw this.failure("Model exchange could not be saved",error);}
 }
 async saveOperationalState(metadata:Record<string,unknown>){
  this.assertActive();try{return await this.ledger.saveMetadata(metadata);}catch(error){throw this.failure("Task modes and ownership could not be saved",error);}
 }
 async executeTool<T>(intent:ToolIntent,execute:()=>Promise<T>):Promise<T>{
  this.assertActive();
  // A duplicate concurrent UI event shares the original boundary and execution.
  // This map is only an optimization; native attempt IDs are authoritative.
  const existing=this.inFlight.get(intent.attemptId);
  const identity=JSON.stringify(intent);
  if(existing){if(existing.identity!==identity)throw Error("Conflicting attempt identity: concurrent inputs differ");return existing.work as Promise<T>;}
  const work=this.dispatch(intent,execute);this.inFlight.set(intent.attemptId,{identity,work});
  void work.finally(()=>this.inFlight.delete(intent.attemptId)).catch(()=>{});
  return work;
 }
 private async dispatch<T>(intent:ToolIntent,execute:()=>Promise<T>):Promise<T>{
  try{
   const attempt=await this.ledger.recordIntent(intent);
   if(attempt.state!=="intent")throw this.failure("Attempt requires reconciliation; it will not be dispatched again",attempt.state,"uncertain");
   this.assertActive();await this.ledger.markStarted(intent.attemptId);this.assertActive();
  }catch(error){if(error instanceof FoundationBoundaryError)throw error;throw this.failure("Tool was not dispatched because its intent was not durable",error);}
  let value:T;
  try{value=await execute();}catch(error){
   const outcome:ToolOutcome={state:intent.sideEffect?"unknown":"failed",preview:String(error).slice(0,12000)};
   if(intent.sideEffect)this.paused=true;
   try{await this.ledger.recordOutcome(intent.attemptId,outcome);}catch(saveError){throw this.failure("Tool outcome could not be saved; inspect the durable intent before any retry",saveError,"uncertain");}
   throw error;
  }
  try{
   const outputRef=await this.ledger.persistOutput(intent.attemptId,value);
   await this.ledger.recordOutcome(intent.attemptId,{state:"succeeded",preview:"Tool result saved; retrieve the full output by its durable reference.",outputRef});
  }catch(error){throw this.failure("Tool outcome could not be saved; execution may have completed and must not be replayed",error,"uncertain");}
  return value;
 }
 async finish(outcome:Exclude<RunState,"active">){
  if(outcome==="completed")this.assertActive();
  try{return await this.ledger.finish(outcome);}catch(error){throw this.failure("Task completion could not be saved",error);}
 }
}
