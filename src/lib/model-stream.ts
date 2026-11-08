import { Channel, invoke } from "@tauri-apps/api/core";

export type StreamEvent = { type: "delta"; text: string } | { type: "done" } | {type:"stopped"};
export type ModelContent = string | Array<{type:"text";text:string}|{type:"image_url";image_url:{url:string}}|{type:"file";file:{filename:string;file_data:string}}>;
export type ToolCall = {id:string;name:string;arguments:string};
export async function streamModel(input: { requestId: string; endpoint: string; model: string; credentialId: string; messages: unknown[]; tools?:unknown[] }, onDelta: (text: string) => void):Promise<ToolCall[]> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = (event) => { if (event.type === "delta") onDelta(event.text); };
  return invoke<ToolCall[]>("stream_chat", { request: input, onEvent: channel });
}
export async function stopModel(requestId: string) { await invoke("stop_chat",{requestId}); }
