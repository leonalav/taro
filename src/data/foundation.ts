/** Serializable presentation contracts. Native code remains the authority for IO. */
export interface Scope { workspaceRoot: string; sessionId: string; runId: string; parentRunId?: string }
export type FoundationState = "queued" | "running" | "awaiting-approval" | "succeeded" | "unchanged" | "skipped" | "warning" | "blocked" | "partially-succeeded" | "failed" | "cancelled" | "interrupted";
export interface Coverage { included: string[]; excluded: string[]; limitation?: string }
export interface DocumentResult { title: string; path: string; markdown: string }
export interface FileOutcome { path: string; outcome: "applied" | "failed" | "skipped"; detail?: string }
export interface FoundationResults {
  "design-plan": DocumentResult;
  instructions: { sources: {path:string; scope:string; hash:string}[]; warnings: string[] };
  checkpoint: { checkpointId: string; files: number; bytes: number };
  review: { files: {path:string; change:string; added:number; removed:number; patch?:string}[]; truncated: boolean };
  "undo-preview": { paths:string[]; expiresAt?:number; token?:string; limitations:string[] };
  restore: { paths:FileOutcome[]; journalId:string; redoAvailable:boolean };
  redo: { paths:FileOutcome[]; journalId:string; redoAvailable:boolean };
  staging: { paths:string[]; direction:"stage"|"unstage" };
  commit: { paths:string[]; message:string; sha?:string; uncertain:boolean };
  context: { inputTokens:number; budgetTokens:number; estimated:boolean; preservedRange:string; attempt:number };
  "context-restore": { restored:string[]; missing:string[] };
  limits: { requests:number; requestLimit:number; activeMinutes:number; remainingWork:string };
  persistence: { boundary:string; durable:boolean };
  restart: { attempt:number; maxAttempts:number; uncertainActions:string[] };
  "child-recovery": { childId:string; parentRunId:string; partialOutput:string; delivered:boolean };
  background: { retrieval:string; process:string; outcome:string; outputPath:string };
}
// Staging covers both stage and unstage; restore and redo have distinct payloads.
export type FoundationKind = keyof FoundationResults;
export type Operation = { [K in FoundationKind]: {
  id:string; attemptId:string; scope:Scope; kind:K; state:FoundationState;
  label:string; reason:string; detail?:string; coverage?:Coverage; result?:FoundationResults[K];
  sequence:number; sample?:boolean; durationMs?:number;
} }[FoundationKind];
export interface FoundationEvent { id:string; sequence:number; operationId:string; runId:string; timestamp:number; payload:Operation }

export type FoundationActionId = "details" | "open" | "open-file" | "open-diff" | "review" | "reload" | "refresh" | "retry" | "resume" | "continue" | "cancel" | "confirm-restore" | "restore" | "redo" | "stage" | "unstage" | "commit";
interface ActionDefinition { label:string; kinds?:FoundationKind[]; states?:FoundationState[]; nativeIO:boolean; approval:boolean }
export const foundationActions = {
  details: {label:"View details",nativeIO:false,approval:false},
  open: {label:"Open",kinds:["design-plan"],states:["succeeded","unchanged"],nativeIO:false,approval:false},
  "open-file": {label:"Open file",kinds:["instructions","review","checkpoint"],states:["succeeded","warning"],nativeIO:true,approval:false},
  "open-diff": {label:"Open diff",kinds:["review","undo-preview","restore","redo"],states:["succeeded","awaiting-approval","partially-succeeded"],nativeIO:true,approval:false},
  review: {label:"Review changes",kinds:["checkpoint","review","restore"],states:["succeeded","warning","partially-succeeded"],nativeIO:true,approval:false},
  reload: {label:"Reload",kinds:["instructions","context-restore","design-plan"],states:["warning","blocked","failed"],nativeIO:true,approval:false},
  refresh: {label:"Refresh",kinds:["review","undo-preview","restore","redo","staging","commit"],states:["blocked","warning","interrupted","succeeded","unchanged","failed"],nativeIO:true,approval:false},
  retry: {label:"Retry",kinds:["design-plan","checkpoint","instructions","review","context","persistence","background"],states:["failed"],nativeIO:true,approval:false},
  resume: {label:"Resume",kinds:["restart","child-recovery"],states:["awaiting-approval"],nativeIO:true,approval:true},
  continue: {label:"Continue",kinds:["limits"],states:["blocked"],nativeIO:true,approval:true},
  cancel: {label:"Cancel",states:["queued","running","awaiting-approval","blocked"],nativeIO:true,approval:false},
  "confirm-restore": {label:"Confirm restore",kinds:["undo-preview","redo"],states:["awaiting-approval"],nativeIO:true,approval:true},
  restore: {label:"Restore",kinds:["undo-preview"],states:["succeeded"],nativeIO:true,approval:true},
  redo: {label:"Redo",kinds:["restore"],states:["succeeded"],nativeIO:true,approval:true},
  stage: {label:"Stage",kinds:["review","staging"],states:["succeeded","awaiting-approval"],nativeIO:true,approval:true},
  unstage: {label:"Unstage",kinds:["staging"],states:["succeeded","awaiting-approval"],nativeIO:true,approval:true},
  commit: {label:"Commit",kinds:["commit"],states:["awaiting-approval"],nativeIO:true,approval:true},
} satisfies Record<FoundationActionId, ActionDefinition>;
export function availableActions(operation:Operation) {
  return (Object.entries(foundationActions) as [FoundationActionId,ActionDefinition][]).filter(([id,a]) =>
    (!a.kinds || a.kinds.includes(operation.kind)) && (!a.states || a.states.includes(operation.state)) &&
    (!(operation.kind==="staging" && (id==="stage"||id==="unstage")) ||
      (operation.result?.direction===(operation.state==="succeeded"?(id==="stage"?"unstage":"stage"):id))) &&
    (id!=="redo" || (operation.kind==="restore" && operation.result?.redoAvailable)) &&
    !(id==="retry" && ["uncertain_outcome","breaker_open","auth_error","network_error"].includes(operation.reason))
  ).map(([id,a])=>({id,...a}));
}
