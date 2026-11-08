import type {ChatMessage} from "@/data/mock";

/** Insert a tool batch where it occurred, keeping any preceding agent narration. */
export function beginToolRound(messages:ChatMessage[],responseId:string,group:ChatMessage):ChatMessage[] {
  const index=messages.findIndex(message=>message.id===responseId);
  if(index<0)return [...messages,group];
  const response=messages[index];
  const keep=response.role!=="agent"||Boolean(response.text.trim());
  const next=[...messages];
  next.splice(index,1,...(keep?[response]:[]),group);
  return next;
}
