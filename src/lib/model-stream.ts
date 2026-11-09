import { Channel, invoke } from "@tauri-apps/api/core";

export type StreamEvent = { type: "delta"; text: string } | { type: "done" } | {type:"stopped"};
export type ModelContent = string | Array<{type:"text";text:string}|{type:"image_url";image_url:{url:string}}|{type:"file";file:{filename:string;file_data:string}}>;
export type ToolCall = {id:string;name:string;arguments:string};
export function resolveModelEndpoint(endpoint: string): {url:string;protocol:"chat-completions"|"responses"} {
  let url: URL;
  try { url = new URL(endpoint.trim()); } catch { throw new Error("Enter a valid HTTP or HTTPS endpoint URL."); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error("Enter a valid HTTP or HTTPS endpoint URL.");
  if (url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => ['key','api_key','api-key','apikey','token','access_token'].includes(key.toLowerCase()))) {
    throw new Error("Endpoint URLs cannot contain credentials or fragments. Use the API key field.");
  }
  const path = url.pathname.replace(/\/+$/, "");
  const protocol = path.endsWith('/responses') ? 'responses' : 'chat-completions';
  url.pathname = path.endsWith('/responses') || path.endsWith('/chat/completions') ? path : path ? `${path}/chat/completions` : '/v1/chat/completions';
  return {url:url.toString(),protocol};
}
export async function streamModel(input: { requestId: string; endpoint: string; model: string; credentialId: string; messages: unknown[]; tools?:unknown[] }, onDelta: (text: string) => void):Promise<ToolCall[]> {
  resolveModelEndpoint(input.endpoint);
  if (!input.model.trim()) throw new Error("Set the provider's model ID in Models settings.");
  const channel = new Channel<StreamEvent>();
  let stopped = false;
  channel.onmessage = (event) => { if (event.type === "delta") onDelta(event.text); if(event.type === "stopped") stopped = true; };
  const calls = await invoke<ToolCall[]>("stream_chat", { request: input, onEvent: channel });
  if(stopped) throw new DOMException("Model request stopped.", "AbortError");
  return calls;
}
export async function stopModel(requestId: string) { await invoke("stop_chat",{requestId}); }
