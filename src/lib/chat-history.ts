import type {ChatMessage,Segment} from "@/data/mock";

export function historyBeforeMessage(messages:ChatMessage[],messageId:string):ChatMessage[]|null {
  const index=messages.findIndex(message=>message.id===messageId);
  return index<0?null:messages.slice(0,index);
}

export function retryFromMessage(messages:ChatMessage[],messageId:string):{history:ChatMessage[];segments:Segment[]}|null {
  const index=messages.findIndex(message=>message.id===messageId);
  if(index<0)return null;
  for(let userIndex=index;userIndex>=0;userIndex--){
    const message=messages[userIndex];
    if(message.role==="user")return {history:messages.slice(0,userIndex),segments:message.segments};
  }
  return null;
}

export function revertToEdit(messages:ChatMessage[],messageId:string):{history:ChatMessage[];editMessageId:string}|null {
  const index=messages.findIndex(message=>message.id===messageId);
  if(index<0)return null;
  for(let userIndex=index;userIndex>=0;userIndex--){
    if(messages[userIndex].role==="user")return {history:messages.slice(0,userIndex+1),editMessageId:messages[userIndex].id};
  }
  return null;
}

export function editedSegments(original:Segment[],text:string,retainedAttachmentIds:string[]):Segment[] {
  const preserved=original.filter(segment=>segment.type==="chip" || segment.type==="attachment"&&segment.attachment&&retainedAttachmentIds.includes(segment.attachment.id));
  return text.trim()?[{type:"text",text},...preserved]:preserved;
}
