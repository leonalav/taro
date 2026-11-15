import type { ChatMessage } from "@/data/mock";
import type { ToolCall } from "./model-stream";
import type { RuntimeOptions, ToolOwner } from "./professional-runtime";

export type SubagentMessage = Extract<ChatMessage, { role: "subagent" }>;
export type FrozenModelRequest = Omit<Parameters<RuntimeOptions["stream"]>[0], "requestId">;
export interface ChildCheckpoint {
  version: 1;
  root: string;
  rootSessionId: string;
  parentSessionId: string;
  owner: Omit<ToolOwner, "signal" | "adi">;
  model: Pick<FrozenModelRequest, "endpoint" | "model" | "credentialId">;
  messages: unknown[];
  round: number;
  allowedTools?: string[];
  loadedTools: string[];
  planPath?: string;
  worktreeRoot?: string;
  request?: FrozenModelRequest;
  pending?: { calls: ToolCall[]; next: number; inFlight: boolean };
}

export interface SavedChild {
  message: SubagentMessage;
  checkpoint: ChildCheckpoint;
}

export function isModelDisconnect(error: unknown): boolean {
  const message=error instanceof Error?error.message:String(error);
  return /^(?:Could not connect to the model endpoint\.|The model endpoint timed out\.|The connection to the model endpoint was interrupted\.|The model stream ended before completion\.|The Responses stream ended before a completed response\.|HTTP (?:502|503|504):)/.test(message);
}

export function waitForModelReconnect(signal: AbortSignal, delay: number): Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(Error("Tool execution stopped"));return;}
    const finish=()=>{
      clearTimeout(timer);
      signal.removeEventListener("abort",abort);
      if(typeof window!=="undefined")window.removeEventListener("online",finish);
    };
    const abort=()=>{finish();reject(Error("Tool execution stopped"));};
    const timer=setTimeout(()=>{finish();resolve();},delay);
    signal.addEventListener("abort",abort,{once:true});
    if(typeof window!=="undefined")window.addEventListener("online",finish,{once:true});
  });
}
