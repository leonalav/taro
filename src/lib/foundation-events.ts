import type { FoundationEvent, FoundationState, Operation } from "@/data/foundation";

export function normalizeActivityState(state:FoundationState | "done" | "stopped"):FoundationState {
  return state==="done"?"succeeded":state==="stopped"?"cancelled":state;
}
export function aggregateActivityState(states:(FoundationState | "done" | "stopped")[]) {
  const all=states.map(normalizeActivityState);
  const hasFailure=all.some(s=>["failed","partially-succeeded","interrupted"].includes(s));
  const actionable=all.some(s=>["awaiting-approval","blocked"].includes(s));
  const order:FoundationState[]=["running","queued","awaiting-approval","blocked","failed","partially-succeeded","interrupted","warning"];
  const state=order.find(s=>all.includes(s)) ?? (all.includes("succeeded")?"succeeded":"unchanged");
  return {state,hasFailure,actionable};
}
/** Replayed/out-of-scope events cannot rewrite the current operation. */
export function projectFoundationEvent(previous:Operation|undefined,event:FoundationEvent):Operation|undefined {
  const next=event.payload;
  if(next.id!==event.operationId || next.scope.runId!==event.runId || !Number.isSafeInteger(event.sequence) || event.sequence<0)return previous;
  if(previous && (previous.id!==next.id || previous.kind!==next.kind || previous.sample!==next.sample || event.sequence<=previous.sequence ||
    previous.scope.runId!==next.scope.runId || previous.scope.sessionId!==next.scope.sessionId || previous.scope.workspaceRoot!==next.scope.workspaceRoot || previous.scope.parentRunId!==next.scope.parentRunId))return previous;
  return {...next,sequence:event.sequence};
}
