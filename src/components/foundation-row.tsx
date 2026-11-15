import * as React from "react";
import { AlertTriangle, Check, ChevronDown, Circle, CircleX, FileText, GitBranch, History, Layers, LoaderCircle, ShieldCheck } from "lucide-react";
import type { FoundationActionId, FoundationKind, FoundationState, Operation } from "@/data/foundation";
import { availableActions } from "@/data/foundation";
import { cn } from "@/utils/cn";
import { useSettings } from "@/components/settings/settings-context";

export const foundationStateLabels:Record<FoundationState,string>={queued:"Queued",running:"Running","awaiting-approval":"Awaiting approval",succeeded:"Completed",unchanged:"Unchanged",skipped:"Skipped",warning:"Warning",blocked:"Blocked","partially-succeeded":"Partially completed",failed:"Failed",cancelled:"Cancelled",interrupted:"Interrupted"};
export function FoundationStatusIcon({state,reduceMotion=false}:{state:FoundationState;reduceMotion?:boolean}) {
  const Icon=state==="running"?LoaderCircle:state==="succeeded"?Check:["failed","interrupted","partially-succeeded"].includes(state)?CircleX:["warning","blocked","awaiting-approval"].includes(state)?AlertTriangle:Circle;
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0",state==="running"&&!reduceMotion&&"animate-spin motion-reduce:animate-none",state==="succeeded"?"text-success":["failed","partially-succeeded","interrupted"].includes(state)?"text-destructive":["blocked","warning","awaiting-approval"].includes(state)?"text-amber-300":"text-muted-foreground")}/>;
}
const actionable=(state:FoundationState)=>["awaiting-approval","blocked","failed","partially-succeeded","interrupted"].includes(state);
const kindIcon=(kind:FoundationKind)=>["review","staging","commit"].includes(kind)?GitBranch:["instructions","design-plan"].includes(kind)?FileText:["restore","redo","restart","child-recovery"].includes(kind)?History:kind==="checkpoint"?ShieldCheck:Layers;

export function FoundationRow({operation,onAction,onOpenDocument}:{operation:Operation;onAction?:(operationId:string,action:FoundationActionId,attemptId:string)=>void;onOpenDocument?:()=>void}) {
  const {reduceMotion}=useSettings().appearance;
  const [open,setOpen]=React.useState(()=>actionable(operation.state));
  const [notice,setNotice]=React.useState("");
  const userToggled=React.useRef(false);
  const previous=React.useRef(operation.state);
  React.useEffect(()=>{
    if(!userToggled.current&&actionable(operation.state)&&!actionable(previous.current))setOpen(true);
    previous.current=operation.state;
  },[operation.state]);
  const bodyId=React.useId();
  const Icon=kindIcon(operation.kind);
  const actions=availableActions(operation);
  return <div data-foundation-row={operation.id} data-foundation-state={operation.state} className="min-w-0 py-2 font-mono text-[11px]">
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5"><FoundationStatusIcon state={operation.state} reduceMotion={reduceMotion}/></span>
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"/>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={()=>{userToggled.current=true;setOpen(v=>!v);}} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-sm text-left leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taro">
        <span title={operation.label} className="min-w-0 flex-1 truncate text-[#e2deea]">{operation.label}</span>
        <span aria-live="polite" aria-atomic="true" className="text-[10px] text-[#a8a3b3]">{foundationStateLabels[operation.state]}</span>
        <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground",open&&"rotate-180")}/>
      </button>
      {actions.some(a=>a.id==="open")&&<button type="button" onClick={onOpenDocument} disabled={!onOpenDocument} title={!onOpenDocument?"Document editor unavailable":undefined} className="mt-0.5 shrink-0 rounded-sm text-[11px] text-taro hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taro disabled:text-muted-foreground disabled:no-underline">Open</button>}
    </div>
    <p className="ml-[3.25rem] mt-0.5 break-words text-[10.5px] leading-relaxed text-[#918b9e]">{operation.detail}</p>
    {open&&<div id={bodyId} className="ml-0 mt-2 min-w-0 rounded-md border border-[#24242b] bg-[#08080b] p-2.5 sm:ml-[3.25rem]">
      {operation.sample&&<p className="mb-2 text-[11px] text-muted-foreground">Sample data · No workspace operations</p>}
      <div className="max-h-64 min-w-0 space-y-2 overflow-auto whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">
        <OperationDetails operation={operation}/>
        {operation.coverage&&<div><p className="font-medium text-foreground/85">Coverage</p><p>{operation.coverage.included.join(", ")}</p><p className="text-muted-foreground">Excluded: {operation.coverage.excluded.join(", ")}. {operation.coverage.limitation}</p></div>}
        <details className="text-muted-foreground"><summary className="cursor-pointer">Operation identity</summary><p>{operation.id}</p><p>Run: {operation.scope.runId} · Attempt: {operation.attemptId}</p><p>Workspace: {operation.scope.workspaceRoot}</p><p>Reason: {operation.reason}</p></details>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-2">
        {actions.filter(action=>action.id!=="open").map(action=>{
          const disabled=action.id==="open"?!onOpenDocument:!operation.sample&&action.id!=="details"&&!onAction;
          return <button key={action.id} type="button" disabled={disabled} title={disabled?"This action is unavailable until its runtime handler is connected":action.approval?"Requires approval bound to the current operation":undefined} className="rounded-sm text-[11px] text-taro hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taro disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline" onClick={()=>{
            if(action.id==="open"){onOpenDocument?.();return;}
            if(operation.sample){setNotice(`Sample only · ${action.label}. No files, processes, or task allowances were changed.`);return;}
            if(action.id==="details"){setNotice(operation.detail??foundationStateLabels[operation.state]);return;}
            onAction?.(operation.id,action.id,operation.attemptId);
          }}>{action.label}</button>;
        })}
      </div>
      {notice&&<p role="status" className="mt-2 break-words text-[11px] text-muted-foreground">{notice}</p>}
      {!operation.sample&&!onAction&&actions.some(a=>a.nativeIO)&&<p className="mt-2 text-[11px] text-muted-foreground">Desktop action unavailable: runtime handler is not connected.</p>}
    </div>}
  </div>;
}

function OperationDetails({operation:op}:{operation:Operation}) {
  switch(op.kind) {
    case "design-plan":return <><p>{op.result?.title}</p><p className="font-mono text-[11px] text-muted-foreground">{op.result?.path}</p><p>Open this independent Markdown document in the existing editor. Saved edits are preserved.</p></>;
    case "instructions":return <>{op.result?.sources.length===0&&<p>No applicable instruction files.</p>}{op.result?.sources.map(s=><div key={s.path}><p>{s.path}</p><p className="text-muted-foreground">{s.scope} · {s.hash}</p></div>)}{op.result?.warnings.map(w=><p key={w}>{w}</p>)}</>;
    case "checkpoint":return <p>{op.state==="succeeded"?"Saved before-images":"Checkpoint candidate"}: {op.result?.files} files · {op.result?.bytes} bytes. {op.result?.checkpointId}</p>;
    case "review":return <>{op.result?.files.length===0&&<p>{op.state==="unchanged"?"No changes in this selection.":"No review data is available. Resolve the reported issue before refreshing."}</p>}{op.result?.files.map(f=><details key={f.path}><summary className="cursor-pointer">{f.path} · {f.change} · +{f.added} −{f.removed}</summary><pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{f.patch??"Sample patch preview unavailable for this file."}</pre></details>)}{op.result?.truncated&&<p>Patch output is partial. Refresh to inspect current changes.</p>}</>;
    case "undo-preview":return <><p>{op.result?.paths.length?`Selected paths: ${op.result.paths.join(", ")}`:"Nothing to restore. No paths selected."}</p><p>Approval binds the current hashes and selection for 10 minutes. Refresh after any intervening edit.</p>{op.result?.limitations.map(l=><p key={l}>{l}</p>)}</>;
    case "restore":case "redo":return <><p>Journal: {op.result?.journalId}</p>{op.result?.paths.map(f=><p key={f.path}>{f.path} · {op.state==="succeeded"||op.state==="partially-succeeded"?f.outcome:"Not applied"}{f.detail?` — ${f.detail}`:""}</p>)}{op.state==="partially-succeeded"&&<p>Review applied paths and the journal before choosing a verified rollback. A multi-file restore is not atomic.</p>}</>;
    case "staging":return <><p>{op.result?.paths.length?`${op.result.direction==="unstage"?"Unstage":"Stage"} selected paths: ${op.result.paths.join(", ")}`:"No paths to stage or unstage."}</p><p>Preserve unrelated staging; revalidate the index before applying.</p></>;
    case "commit":return <><p>{op.result?.message}</p><p>{op.result?.paths.join(", ")}</p>{op.result?.sha&&<p>Sample commit: {op.result.sha}</p>}{op.result?.uncertain&&<p>Outcome unknown. Inspect HEAD and the index before any further action. Do not replay this commit.</p>}</>;
    case "context":return <><p>{op.result?.inputTokens.toLocaleString()} / {op.result?.budgetTokens.toLocaleString()} input tokens · {op.result?.estimated?"Estimated":"Measured"}</p><p>{op.result?.preservedRange}</p><p>Attempt {op.result?.attempt} of 3. Full transcripts remain retained; failed summaries do not replace valid context.</p></>;
    case "context-restore":return <><p>{op.result?.restored.length?`Context to rehydrate: ${op.result.restored.join(", ")}`:"No operational context to restore."}</p><p>Missing: {op.result?.missing.join(", ")||"None in this sample"}. Plan and read-only restrictions remain active.</p></>;
    case "limits":return <><p>{op.result?.requests} / {op.result?.requestLimit} requests · {op.result?.activeMinutes} active minutes</p><p>{op.result?.remainingWork}</p></>;
    case "persistence":return <><p>{op.result?.boundary} · {op.result?.durable?"Durable boundary recorded (sample)":"Not durably saved"}</p>{!op.result?.durable&&<p>Pause before the next mutation. Restore storage access before continuing.</p>}</>;
    case "restart":return <><p>Recovery attempt {op.result?.attempt} / {op.result?.maxAttempts}</p>{op.result?.uncertainActions.map(a=><p key={a}>{a}</p>)}<p>Resume requires your action and revalidated workspace, model, plan, and process ownership.</p></>;
    case "child-recovery":return <><p>{op.result?.childId} · Parent: {op.result?.parentRunId}</p><p>{op.result?.partialOutput}</p><p>Completion notification: {op.result?.delivered?"Delivered once (sample)":"Not delivered"}</p></>;
    case "background":return <><p>Retrieval: {op.result?.retrieval}</p><p>Process: {op.result?.process}</p><p>Outcome: {op.result?.outcome}</p><p className="font-mono text-[11px]">{op.result?.outputPath}</p></>;
  }
}
