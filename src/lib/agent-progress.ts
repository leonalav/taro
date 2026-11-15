import type { ChatMessage } from "@/data/mock";
import {webLabel} from './web-research';

export type ThoughtMessage = {
  id: string;
  role: "thought";
  agentId: string;
  status: "working" | "completed" | "stopped" | "failed" | "interrupted";
  label: string;
  startedAt: number;
  updatedAt: number;
  durationMs: number;
  pausedAt?: number;
  pausedMs?: number;
  /** Observable activity summaries only; never model reasoning. */
  steps: string[];
};

type ApprovalClock={pausedAt?:number;pausedMs?:number};
export function activeElapsed(startedAt:number,now:number,clock:ApprovalClock):number {
  return Math.max(0,(clock.pausedAt??now)-startedAt-(clock.pausedMs??0));
}
function pauseClock<T extends ApprovalClock>(clock:T,paused:boolean,now:number):T {
  if(paused)return clock.pausedAt===undefined?{...clock,pausedAt:now}:clock;
  return clock.pausedAt===undefined?clock:{...clock,pausedAt:undefined,pausedMs:(clock.pausedMs??0)+Math.max(0,now-clock.pausedAt)};
}
export function pauseRunClocks(messages:ChatMessage[],paused:boolean,now=Date.now()):ChatMessage[] {
  return messages.map(message=>{
    if(message.role==="thought"&&message.status==="working"||
       message.role==="subagent"&&(message.status==="running"||message.pausedAt!==undefined)||
       message.role==="activity-group"&&(message.pausedAt!==undefined||message.activities.some(activity=>activity.status==="running")))return pauseClock(message,paused,now);
    return message;
  });
}

export function startThought(id: string, agentId: string, now = Date.now()): ThoughtMessage {
  return { id, role: "thought", agentId, status: "working", label: "Thinking…", startedAt: now, updatedAt: now, durationMs: 0, steps: ["Preparing response"] };
}

export function advanceThought(message: ThoughtMessage, label: string, step?: string, now = Date.now()): ThoughtMessage {
  if(message.status !== "working")return message;
  const steps=step && message.steps.at(-1)!==step ? [...message.steps,step].slice(-48) : message.steps;
  return {...message,label,steps,updatedAt:now,durationMs:activeElapsed(message.startedAt,now,message)};
}

export function settleThought(message: ThoughtMessage, status: Exclude<ThoughtMessage["status"],"working">, now = Date.now()): ThoughtMessage {
  if(message.status !== "working")return message;
  return {...message,status,updatedAt:now,durationMs:activeElapsed(message.startedAt,now,message)};
}

/** A persisted run cannot still be running after the app restarts. */
export function recoverThoughts(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(message=>{
    if(message.role==='activity-group')return {...message,activities:message.activities.map(a=>a.web&&['running','queued'].includes(a.status)?{...a,status:'interrupted' as const,label:webLabel(a.web,'interrupted')}:a)};
    if(message.role==="thought"&&message.status==="working")return settleThought(message,"interrupted",message.updatedAt);
    if(message.role==="agent"&&!message.text&&message.trace?.includes("Generating response"))return {id:message.id,role:"thought",agentId:message.agentId,status:"interrupted",label:"Thinking…",startedAt:0,updatedAt:message.durationMs??0,durationMs:message.durationMs??0,steps:["The previous response was interrupted"]};
    if(message.role==="subagent"&&message.status==="running")return {...message,status:"failed",activities:message.activities.map(a=>a.web&&['running','queued'].includes(a.status)?{...a,status:'interrupted' as const,label:webLabel(a.web,'interrupted')}:a),result:"Child agent interrupted when the application closed. Start a new Agent run to continue."};
    return message;
  });
}
