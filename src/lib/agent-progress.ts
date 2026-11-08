import type { ChatMessage } from "@/data/mock";

export type ThoughtMessage = {
  id: string;
  role: "thought";
  agentId: string;
  status: "working" | "completed" | "stopped" | "failed" | "interrupted";
  label: string;
  startedAt: number;
  updatedAt: number;
  durationMs: number;
  /** Observable activity summaries only; never model reasoning. */
  steps: string[];
};

export function startThought(id: string, agentId: string, now = Date.now()): ThoughtMessage {
  return { id, role: "thought", agentId, status: "working", label: "Thinking…", startedAt: now, updatedAt: now, durationMs: 0, steps: ["Preparing response"] };
}

export function advanceThought(message: ThoughtMessage, label: string, step?: string, now = Date.now()): ThoughtMessage {
  if(message.status !== "working")return message;
  const steps=step && message.steps.at(-1)!==step ? [...message.steps,step].slice(-48) : message.steps;
  return {...message,label,steps,updatedAt:now,durationMs:Math.max(0,now-message.startedAt)};
}

export function settleThought(message: ThoughtMessage, status: Exclude<ThoughtMessage["status"],"working">, now = Date.now()): ThoughtMessage {
  if(message.status !== "working")return message;
  return {...message,status,updatedAt:now,durationMs:Math.max(0,now-message.startedAt)};
}

/** A persisted run cannot still be running after the app restarts. */
export function recoverThoughts(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(message=>{
    if(message.role==="thought"&&message.status==="working")return settleThought(message,"interrupted",message.updatedAt);
    if(message.role==="agent"&&!message.text&&message.trace?.includes("Generating response"))return {id:message.id,role:"thought",agentId:message.agentId,status:"interrupted",label:"Thinking…",startedAt:0,updatedAt:message.durationMs??0,durationMs:message.durationMs??0,steps:["The previous response was interrupted"]};
    if(message.role==="subagent"&&message.status==="running")return {...message,status:"failed",result:"Child agent interrupted when the application closed. Start a new Agent run to continue."};
    return message;
  });
}
